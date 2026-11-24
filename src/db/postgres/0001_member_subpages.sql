UPDATE "roles"
SET "pages_limit" = 5
WHERE "is_builtin" AND "name" = 'Member' AND "pages_limit" = 1;
