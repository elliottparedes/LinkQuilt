# Deploy LinkQuilt on Dokploy

Deploy the repository as a **Dokploy Application** using the root **Dockerfile**. The image includes the Next.js app, PostgreSQL migrations, and the one-time SQLite importer. PostgreSQL runs separately on the existing VPS. Local files live in the app's persistent volume.

## Configure the application

1. Select the Git repository and deployment revision, choose the Dockerfile build, and point it at `Dockerfile` in the repository root. Keep one replica.
2. Mount the existing LinkQuilt data volume at `/app/data`. On an upgrade, confirm the volume name against the old app container before deploying.
3. Set these runtime environment variables in Dokploy. Set `SECRET_KEY` to the existing value if the old install supplied one. If it used `/app/data/.secret-key`, keep that file in the volume.

   ~~~dotenv
   BASE_URL=https://links.example.com
   DATABASE_URL=postgresql://linkbreeze_app:password@private-postgres-host:5432/linkbreeze
   ~~~

4. Route the HTTPS domain to container port `3000` and use `/api/health` for readiness. Confirm that a container on the app's network can connect to the PostgreSQL address before the upgrade. Use the PostgreSQL database owner for this application's migrations.

When PostgreSQL is a Dokploy service on the same server, use its internal service name in the application's `DATABASE_URL`. A local workstation can use the VPS's Tailscale address for the same database.

New installations can start directly and create the administrator through `/setup`. Use the existing **Accounts → Public signup** setting when ready to open registration. For a database upgrade, complete the import before starting the new app.

If you are retiring the SQLite data and starting over, keep a snapshot and set `LINKBREEZE_START_FRESH=true` in Dokploy. Start the new app on the existing volume and complete `/setup` privately before putting it on the public domain. A legacy installation that needs its accounts and pages should use the import below.

## Upgrade an existing SQLite installation

Rehearse first using a separate database and a copy of the app volume. Record the elapsed time and verify representative pages, domains, logins, 2FA, uploads, edits, redirects, and analytics. Keep the current image available for rollback.

1. Build the candidate image from the intended Git revision. On the VPS, it can also be built with `docker build -t linkquilt:postgres-upgrade .`.
2. Serve a maintenance response and stop the old app. Copy the full `/app/data` volume to a protected snapshot directory, including the SQLite file and any `-wal` and `-shm` files. Save the old signing key with the recovery material. For a nondefault legacy database path, copy that file and its companions too.
3. Run the importer in a one-off container with the same network reachability as the Dokploy application. Use a protected env file containing the target `DATABASE_URL`. Replace the network name and absolute snapshot path below.

   ~~~sh
   docker run --rm --network <app-network> \
     --env-file /secure/linkquilt-postgres.env \
     --mount type=bind,src=/absolute/path/to/snapshot,dst=/snapshot,readonly \
     linkquilt:postgres-upgrade node scripts/import-sqlite.mjs /snapshot/linkbreeze.db
   ~~~

   The importer applies the PostgreSQL schema, verifies the copied rows, and prints counts and digests. Save that output with the snapshot. It requires an empty destination before the first successful import. After a successful import, rerunning against the same destination reports completion.

4. Start the Dockerfile deployment on the original volume. Check readiness and privately verify pages and domains before reopening traffic. Enable public signup through **Accounts** once the launch checks pass.
5. If verification fails before reopening, bring back the old image and SQLite volume while maintenance is still active. Once PostgreSQL has accepted production writes, recover from PostgreSQL and reconcile any writes after the last backup.

For the bundled self-host Compose stack, start only the database first with `docker compose up -d --wait postgres`. Build the app, then run `docker compose run --rm --no-deps linkbreeze node scripts/import-sqlite.mjs /app/data/linkbreeze.db` after stopping the old app and taking a snapshot. Finally start the new app with `docker compose up -d linkbreeze`.

## Back up and rehearse recovery

Schedule a PostgreSQL custom-format dump and a backup of the app volume using the existing host backup schedule. Use a `pg_dump` client at least as new as the server. A short application write pause makes the database and uploaded files consistent with each other.

~~~sh
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file=linkquilt.dump
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --exit-on-error linkquilt.dump
~~~

Restore into a newly created database, mount a copy of the matching app volume, and supply the matching signing key. Verify that the restored app starts and can load a public page and an account. The Settings exports remain available for portable configuration backups.

## Check launch capacity

Create a separate, private Dokploy Application using the same Dockerfile and a rehearsal database named `linkbreeze_load_<name>`. Complete setup and create the staging API key. Run the load generator from another machine with network access to the private instance.

~~~sh
node scripts/load-postgres.mjs seed
node scripts/load-postgres.mjs run https://private-rehearsal.example.com
~~~

Set `DATABASE_URL` to the rehearsal database for both commands. Set `LINKBREEZE_LOAD_API_KEY` for the run. The HTTP runner verifies the app serves the matching test fixture before it sends traffic. Use a private entry point that allows the generator's synthetic visitor IPs to reach the app. Confirm pageview rows increase during the run, since a proxy that overwrites them can turn it into a read-only benchmark.

The full run lasts 30 minutes. It targets 100 public page requests, 20 redirects that record clicks, and 2 authenticated link edits per second with 5,000 creators and 500,000 seeded pageviews. Require public-page p95 under 250 ms and fewer than 0.5% unexpected failures. Compare a lower shared read workload against the SQLite release and watch VPS memory, disk, PostgreSQL connection waits, and app logs. The operator can pause new registrations in **Accounts** while keeping existing public pages live.

For hosted abuse reports, use the [LinkQuilt issue tracker](https://github.com/elliottparedes/LinkQuilt/issues/new) and include the public page URL. For security vulnerabilities, use the [security reporting instructions](../SECURITY.md).
