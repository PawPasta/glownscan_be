-- Migration V15: create_package_permission_entitlements
-- Premium package permissions are separate from durable account roles.

INSERT INTO app_auth.permissions (code, name, description)
VALUES
    ('SKIN_ANALYSIS_BASIC', 'Run basic skin analysis', 'Run an analysis and view its basic status summary'),
    ('SKIN_ANALYSIS_DETAILS', 'View detailed skin analysis', 'View detailed metrics, profile, regions, observations, and highlights'),
    ('RECOMMENDATION_READ', 'Read personalized recommendations', 'Read personalized product recommendations'),
    ('ROUTINE_MANAGE', 'Manage skincare routines', 'Create and manage personalized skincare routines')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_auth.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM app_auth.roles role
CROSS JOIN app_auth.permissions permission
WHERE role.code = 'ADMIN'
   OR (role.code = 'USER' AND permission.code = 'SKIN_ANALYSIS_BASIC')
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_billing.premium_package_permissions (
    package_code VARCHAR(30) NOT NULL REFERENCES app_billing.premium_packages(code) ON DELETE CASCADE,
    permission_id SMALLINT NOT NULL REFERENCES app_auth.permissions(id) ON DELETE RESTRICT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (package_code, permission_id)
);

INSERT INTO app_billing.premium_package_permissions (package_code, permission_id)
SELECT package.code, permission.id
FROM app_billing.premium_packages package
CROSS JOIN app_auth.permissions permission
WHERE package.code IN ('PREMIUM_MONTHLY', 'PREMIUM_QUARTERLY', 'PREMIUM_YEARLY')
  AND permission.code IN (
      'SKIN_ANALYSIS_DETAILS',
      'RECOMMENDATION_READ',
      'ROUTINE_MANAGE'
  )
ON CONFLICT (package_code, permission_id) DO NOTHING;

ALTER TABLE app_billing.premium_package_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_billing.premium_package_permissions FROM PUBLIC;
