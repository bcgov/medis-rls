# BACKUP POSTGRES DATABASE

Pre-requisites:
1. PVC called pg-backup-pvc
2. NetworkPolicy as described in pg.backup.networkpolicy.yaml
3. Secret called rls-patroni-dev (keys are app-db-name, app-db-username,app-db-password)
4. Config map called pg-backup-bin with one key called pg_backup.sh that contains backup script, as described in backup-configmap.yaml

Triggering the job is two phase process. First you need to process Job template and second is to push the job definition to OpenShift. Here is one liber to do both:
oc process -p DATABASE_SECRET=rls-patroni-dev -p DATABASE_BACKUP_VOLUME_CLAIM=pg-backup-pvc -f pg.backup.cron.yaml | oc apply -f -