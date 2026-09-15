# RETIRED — PM2 / NGINX DEPLOYMENT GUIDE

This historical deployment path is intentionally non-executable.

OmniSeller production has one supported process manager and release path:

- systemd unit: `deploy/omniseller-web.service.template`;
- platform setup: `scripts/vps_migrate_and_setup_platform.sh`;
- immutable release/deploy verification: `scripts/vps_deploy_and_verify.sh`.

The former `ecosystem.config.cjs` PM2 entry point was removed because it could start the application without the R4.3 single-path production policy. Do not recreate, copy or run the former PM2 commands from Git history.

Historical infrastructure details remain recoverable from Git. They are not operational instructions.
