import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL;
const accessToken = __ENV.ACCESS_TOKEN;

if (!baseUrl || !accessToken) {
  throw new Error('Set BASE_URL and a non-production ACCESS_TOKEN.');
}

export const options = {
  scenarios: {
    read_paths: { executor: 'constant-vus', vus: 2, duration: '30s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const params = { headers: { Authorization: `Bearer ${accessToken}` } };

export default function () {
  check(http.get(`${baseUrl}/skin-analysis?page=1&limit=20`, params), {
    'history is authorized': (response) => response.status === 200,
  });
  check(http.get(`${baseUrl}/auth/profile`, params), {
    'profile is authorized': (response) => response.status === 200,
  });
  sleep(1);
}
