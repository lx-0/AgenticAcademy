#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma || {
  echo "Migration failed, trying db push..."
  npx prisma db push --schema=packages/db/prisma/schema.prisma --accept-data-loss
}

echo "Starting application..."
exec "$@"
