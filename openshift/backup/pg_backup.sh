#!/bin/sh
DATABASE_HOST=airflow-postgresql
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_BACKUP_KEEP=2

BFILENAME=backup-"${DATABASE_NAME}-"`date +%Y-%m-%d_%H%M%S`.sql.gz;
PGPASSWORD="${DATABASE_PASSWORD}" pg_dump --username=$DATABASE_USER --host=$DATABASE_HOST --port=$DATABASE_PORT --column-inserts --clean --create ${DATABASE_NAME} | gzip > /backup/"$BFILENAME"; 
PGDUMP_RETURN_CODE=${?}
if [[ 0 != ${PGDUMP_RETURN_CODE} ]]
  then
  echo -e "Backup failed"
  exit ${PGDUMP_RETURN_CODE}
else
  echo "";
  echo "Backup successful"; du -h /backup/"${BFILENAME}"; 
  echo "to restore the backup to the serviced host use: $ psql --username=$DATABASE_USER --password --host=$DATABASE_HOST --port=$DATABASE_PORT postgres < /database-backup/<backupfile> (unpacked)"
  echo "Deleting backup older than ${DATABASE_BACKUP_KEEP} days"
  cd /backup/
  find . -type f -mtime +${DATABASE_BACKUP_KEEP} -exec rm -f {} \;
fi