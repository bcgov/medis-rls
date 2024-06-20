exports.up = function (knex) {
  return Promise.resolve()
    .then(() =>
      knex.schema.raw(`CREATE OR REPLACE VIEW public.form_vw
          AS SELECT DISTINCT ON ((lower(f.name::text)), fv.version, f.id) f.id,
              f.name,
              f.active,
              f.description,
              f.labels,
              f."createdAt",
              f."createdBy",
              f."updatedAt",
              f."updatedBy",
              fv.id AS "formVersionId",
              fv.version,
                  CASE
                      WHEN count(fip.code) = 0 THEN '{}'::character varying[]
                      ELSE array_agg(DISTINCT fip.code)
                  END AS "identityProviders",
                  CASE
                      WHEN count(ip.idp) = 0 THEN '{}'::character varying[]
                      ELSE array_agg(DISTINCT ip.idp)
                  END AS idps,
              fv.published,
              fv."updatedAt" AS "versionUpdatedAt",
              f."allowSubmitterToUploadFile",
              f.remote
            FROM form f
              LEFT JOIN LATERAL ( SELECT v.id,
                      v."formId",
                      v.version,
                      v.schema,
                      v."createdBy",
                      v."createdAt",
                      v."updatedBy",
                      v."updatedAt",
                      v.published
                    FROM form_version v
                    WHERE v."formId" = f.id
                    ORDER BY (
                          CASE
                              WHEN v.published THEN 1
                              ELSE 0
                          END) DESC, v.version DESC
                  LIMIT 1) fv ON true
              LEFT JOIN form_identity_provider fip ON f.id = fip."formId"
              LEFT JOIN identity_provider ip ON fip.code::text = ip.code::text
            GROUP BY f.id, f.name, f.active, f.description, f.labels, f."createdAt", f."createdBy", f."updatedAt", f."updatedBy", f.remote, fv.id, fv.version, fv.published, fv."updatedAt"`)
    )
    .then(() =>
      knex.schema.raw(`CREATE OR REPLACE VIEW public.user_form_access_vw
        AS SELECT r."userId",
            u."idpUserId",
            u.username,
            u."fullName",
            u."firstName",
            u."lastName",
            u.email,
            r."formId",
            f.name AS "formName",
            f.labels,
            u."idpCode" AS "user_idpCode",
            f."identityProviders",
            f."identityProviders" AS form_login_required,
            f.idps,
            f.active,
            f."formVersionId",
            f.version,
            r.roles,
            p.permissions,
            f.published,
            f."versionUpdatedAt",
            f.description AS "formDescription",
            f.remote
           FROM "user" u
             JOIN user_form_roles_vw r ON u.id = r."userId"
             JOIN user_form_permissions_vw p ON r."userId" = p."userId" AND r."formId" = p."formId"
             JOIN form_vw f ON f.id = p."formId"
          ORDER BY (lower(u."lastName"::text)), (lower(u."firstName"::text)), (lower(f.name::text));`)
    );
};

exports.down = function (knex) {
  return Promise.resolve()
    .then(() =>
      knex.schema.raw(`CREATE OR REPLACE VIEW public.form_vw
    AS SELECT DISTINCT ON ((lower(f.name::text)), fv.version, f.id) f.id,
        f.name,
        f.active,
        f.description,
        f.labels,
        f."createdAt",
        f."createdBy",
        f."updatedAt",
        f."updatedBy",
        fv.id AS "formVersionId",
        fv.version,
            CASE
                WHEN count(fip.code) = 0 THEN '{}'::character varying[]
                ELSE array_agg(DISTINCT fip.code)
            END AS "identityProviders",
            CASE
                WHEN count(ip.idp) = 0 THEN '{}'::character varying[]
                ELSE array_agg(DISTINCT ip.idp)
            END AS idps,
        fv.published,
        fv."updatedAt" AS "versionUpdatedAt",
        f."allowSubmitterToUploadFile"
      FROM form f
        LEFT JOIN LATERAL ( SELECT v.id,
                v."formId",
                v.version,
                v.schema,
                v."createdBy",
                v."createdAt",
                v."updatedBy",
                v."updatedAt",
                v.published
              FROM form_version v
              WHERE v."formId" = f.id
              ORDER BY (
                    CASE
                        WHEN v.published THEN 1
                        ELSE 0
                    END) DESC, v.version DESC
            LIMIT 1) fv ON true
        LEFT JOIN form_identity_provider fip ON f.id = fip."formId"
        LEFT JOIN identity_provider ip ON fip.code::text = ip.code::text
      GROUP BY f.id, f.name, f.active, f.description, f.labels, f."createdAt", f."createdBy", f."updatedAt", f."updatedBy", fv.id, fv.version, fv.published, fv."updatedAt"`)
    )
    .then(() =>
      knex.schema.raw(`CREATE OR REPLACE VIEW public.user_form_access_vw
        AS SELECT r."userId",
            u."idpUserId",
            u.username,
            u."fullName",
            u."firstName",
            u."lastName",
            u.email,
            r."formId",
            f.name AS "formName",
            f.labels,
            u."idpCode" AS "user_idpCode",
            f."identityProviders",
            f."identityProviders" AS form_login_required,
            f.idps,
            f.active,
            f."formVersionId",
            f.version,
            r.roles,
            p.permissions,
            f.published,
            f."versionUpdatedAt",
            f.description AS "formDescription"
          FROM "user" u
            JOIN user_form_roles_vw r ON u.id = r."userId"
            JOIN user_form_permissions_vw p ON r."userId" = p."userId" AND r."formId" = p."formId"
            JOIN form_vw f ON f.id = p."formId"
          ORDER BY (lower(u."lastName"::text)), (lower(u."firstName"::text)), (lower(f.name::text));`)
    );
};
