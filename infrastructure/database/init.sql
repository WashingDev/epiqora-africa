-- Retrieve the application password from the container environment.
\getenv app_password DB_PASSWORD

-- Create the restricted application database account.
SELECT format(
    'CREATE ROLE outbreakwatch_app LOGIN PASSWORD %L',
    :'app_password'
) \gexec

-- Grant database connection privileges.
GRANT CONNECT ON DATABASE outbreakwatch TO outbreakwatch_app;

-- Connect to the application database.
\connect outbreakwatch

-- Grant schema permissions.
GRANT USAGE, CREATE ON SCHEMA public TO outbreakwatch_app;
