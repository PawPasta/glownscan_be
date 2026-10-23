-- Migration V3: seed_auth_reference_data
-- ============================================================

INSERT INTO app_auth.roles (code, name, description)
VALUES
    ('USER', 'User', 'Standard authenticated user'),
    ('ADMIN', 'Administrator', 'System administrator')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_auth.permissions (code, name)
VALUES
    ('PROFILE_READ_OWN', 'Read own profile'),
    ('PROFILE_UPDATE_OWN', 'Update own profile'),
    ('DEVICE_READ_OWN', 'Read own devices'),
    ('DEVICE_REVOKE_OWN', 'Revoke own device sessions'),
    ('USER_READ_ANY', 'Read users for administration'),
    ('USER_MANAGE_ANY', 'Manage user accounts'),
    ('ROLE_MANAGE', 'Manage roles'),
    ('AUDIT_LOG_READ', 'Read authentication audit logs')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_auth.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM app_auth.roles role
CROSS JOIN app_auth.permissions permission
WHERE role.code = 'ADMIN'
   OR (role.code = 'USER' AND permission.code IN (
       'PROFILE_READ_OWN',
       'PROFILE_UPDATE_OWN',
       'DEVICE_READ_OWN',
       'DEVICE_REVOKE_OWN'
   ))
ON CONFLICT (role_id, permission_id) DO NOTHING;
