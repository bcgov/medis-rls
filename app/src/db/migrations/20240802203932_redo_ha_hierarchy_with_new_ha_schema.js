exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.raw(`CREATE OR REPLACE VIEW ha_hierarchy AS
  WITH community_expanded AS (
    SELECT
        jsonb_array_elements(submission->'communities') AS community,
        submission->>'healthAuthority' AS "healthAuthority",
        "formId"
    FROM
        submissions_data_vw
),
pcn_expanded AS (
    SELECT
        community->>'communityName' AS "communityName",
        jsonb_array_elements(community->'pcn') AS pcn,
        "healthAuthority",
        "formId"
    FROM
        community_expanded
),
chc_expanded AS (
    SELECT
        "communityName",
        pcn->>'pcnName' AS "pcnName",
        pcn->>'pcnType' AS "pcnType",
        jsonb_array_elements(pcn->'chc') AS chc,
        "healthAuthority",
        "formId"
    FROM
        pcn_expanded
),
upcc_expanded AS (
    SELECT
        "communityName",
        pcn->>'pcnName' AS "pcnName",
        pcn->>'pcnType' AS "pcnType",
        jsonb_array_elements(pcn->'upcc') AS upcc,
        "healthAuthority",
        "formId"
    FROM
        pcn_expanded
),
fnpcc_expanded AS (
    SELECT
        "communityName",
        pcn->>'pcnName' AS "pcnName",
        pcn->>'pcnType' AS "pcnType",
        jsonb_array_elements(pcn->'fnpcc') AS fnpcc,
        "healthAuthority",
        "formId"
    FROM
        pcn_expanded
),
nppcc_expanded AS (
    SELECT
        "communityName",
        pcn->>'pcnName' AS "pcnName",
        pcn->>'pcnType' AS "pcnType",
        jsonb_array_elements(pcn->'nppcc') AS nppcc,
        "healthAuthority",
        "formId"
    FROM
        pcn_expanded
),
pcn_clinic_expanded AS (
    SELECT
        "communityName",
        pcn->>'pcnName' AS "pcnName",
        pcn->>'pcnType' AS "pcnType",
        jsonb_array_elements(pcn->'pcnClinic') AS pcnClinic,
        "healthAuthority",
        "formId"
    FROM
        pcn_expanded
),
chc_clinic_expanded AS (
    SELECT
        "communityName",
        "pcnName",
        "pcnType",
        chc->>'chcName' AS "chcName",
        NULL AS "upccName",
        NULL AS "upccTypeOfCare",
        NULL AS "fnpccName",
        NULL AS "nppccName",
        NULL AS "pcnClinicName",
        NULL AS "pcnClinicType",
        "healthAuthority",
        "formId"
    FROM
        chc_expanded
),
upcc_clinic_expanded AS (
    SELECT
        "communityName",
        "pcnName",
        "pcnType",
        NULL AS "chcName",
        upcc->>'upccName' AS "upccName",
        upcc->>'typeOfCare' AS "upccTypeOfCare",
        NULL AS "fnpccName",
        NULL AS "nppccName",
        NULL AS "pcnClinicName",
        NULL AS "pcnClinicType",
        "healthAuthority",
        "formId"
    FROM
        upcc_expanded
),
fnpcc_clinic_expanded AS (
    SELECT
        "communityName",
        "pcnName",
        "pcnType",
        NULL AS "chcName",
        NULL AS "upccName",
        NULL AS "upccTypeOfCare",
        fnpcc->>'fnpccName' AS "fnpccName",
        NULL AS "nppccName",
        NULL AS "pcnClinicName",
        NULL AS "pcnClinicType",
        "healthAuthority",
        "formId"
    FROM
        fnpcc_expanded
),
nppcc_clinic_expanded AS (
    SELECT
        "communityName",
        "pcnName",
        "pcnType",
        NULL AS "chcName",
        NULL AS "upccName",
        NULL AS "upccTypeOfCare",
        NULL AS "fnpccName",
        nppcc->>'nppccName' AS "nppccName",
        NULL AS "pcnClinicName",
        NULL AS "pcnClinicType",
        "healthAuthority",
        "formId"
    FROM
        nppcc_expanded
),
pcn_clinic_final AS (
    SELECT
        "communityName",
        "pcnName",
        "pcnType",
        NULL AS "chcName",
        NULL AS "upccName",
        NULL AS "upccTypeOfCare",
        NULL AS "fnpccName",
        NULL AS "nppccName",
        pcnClinic->>'clinicName' AS "pcnClinicName",
        pcnClinic->>'clinicType' AS "pcnClinicType",
        "healthAuthority",
        "formId"
    FROM
        pcn_clinic_expanded
),
all_clinics AS (
    SELECT * FROM chc_clinic_expanded
    UNION ALL
    SELECT * FROM upcc_clinic_expanded
    UNION ALL
    SELECT * FROM fnpcc_clinic_expanded
    UNION ALL
    SELECT * FROM nppcc_clinic_expanded
    UNION ALL
    SELECT * FROM pcn_clinic_final
)
SELECT
    row_number() OVER () AS id,
    "healthAuthority",
    "communityName",
    "pcnName",
    "pcnType",
    "pcnClinicName",
    "pcnClinicType",
    "chcName",
    "upccName",
    "upccTypeOfCare",
    "fnpccName",
    "nppccName",
    "formId"
FROM
    all_clinics;`)
  );
};

exports.down = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.raw(`CREATE OR REPLACE VIEW ha_hierarchy AS
  WITH community_expanded AS (
      SELECT
          jsonb_array_elements(submission->'communities') AS community,
          submission->>'healthAuthority' AS health_authority,
          "formId"
      FROM
          submissions_data_vw
  ),
  pcn_expanded AS (
      SELECT
          community->>'communityName' AS community_name,
          jsonb_array_elements(community->'pcn') AS pcn,
          health_authority,
          "formId"
      FROM
          community_expanded
  ),
  chc_expanded AS (
      SELECT
          community_name,
          pcn->>'pcnName' AS pcn_name,
          pcn->>'pcnType' AS pcn_type,
          jsonb_array_elements(pcn->'chc') AS chc,
          health_authority,
          "formId"
      FROM
          pcn_expanded
  ),
  upcc_expanded AS (
      SELECT
          community_name,
          pcn->>'pcnName' AS pcn_name,
          pcn->>'pcnType' AS pcn_type,
          jsonb_array_elements(pcn->'upcc') AS upcc,
          health_authority,
          "formId"
      FROM
          pcn_expanded
  ),
  fnpcc_expanded AS (
      SELECT
          community_name,
          pcn->>'pcnName' AS pcn_name,
          pcn->>'pcnType' AS pcn_type,
          jsonb_array_elements(pcn->'fnpcc') AS fnpcc,
          health_authority,
          "formId"
      FROM
          pcn_expanded
  ),
  nppcc_expanded AS (
      SELECT
          community_name,
          pcn->>'pcnName' AS pcn_name,
          pcn->>'pcnType' AS pcn_type,
          jsonb_array_elements(pcn->'nppcc') AS nppcc,
          health_authority,
          "formId"
      FROM
          pcn_expanded
  ),
  pcn_clinic_expanded AS (
      SELECT
          community_name,
          pcn->>'pcnName' AS pcn_name,
          pcn->>'pcnType' AS pcn_type,
          jsonb_array_elements(pcn->'pcnClinic') AS pcn_clinic,
          health_authority,
          "formId"
      FROM
          pcn_expanded
  ),
  chc_clinic_expanded AS (
      SELECT
          community_name,
          pcn_name,
          pcn_type,
          chc->>'chcName' AS chc_name,
          jsonb_array_elements(chc->'chcClinic') AS chc_clinic,
          health_authority,
          "formId"
      FROM
          chc_expanded
  ),
  upcc_clinic_expanded AS (
      SELECT
          community_name,
          pcn_name,
          pcn_type,
          upcc->>'upccName' AS upcc_name,
          upcc->>'typeOfCare' AS upcc_type_of_care,
          jsonb_array_elements(upcc->'upccClinic') AS upcc_clinic,
          health_authority,
          "formId"
      FROM
          upcc_expanded
  ),
  fnpcc_clinic_expanded AS (
      SELECT
          community_name,
          pcn_name,
          pcn_type,
          fnpcc->>'fnpccName' AS fnpcc_name,
          jsonb_array_elements(fnpcc->'fnpccClinic') AS fnpcc_clinic,
          health_authority,
          "formId"
      FROM
          fnpcc_expanded
  ),
  nppcc_clinic_expanded AS (
      SELECT
          community_name,
          pcn_name,
          pcn_type,
          nppcc->>'nppccName' AS nppcc_name,
          jsonb_array_elements(nppcc->'nppccClinic') AS nppcc_clinic,
          health_authority,
          "formId"
      FROM
          nppcc_expanded
  )
  select
      health_authority,
      community_name,
      pcn_name,
      pcn_type,
      pcn_clinic->>'clinicName' AS pcn_clinic_name,
      pcn_clinic->>'clinicType' AS pcn_clinic_type,
      chc_name,
      chc_clinic->>'clinicName' AS chc_clinic_name,
      chc_clinic->>'clinicType' AS chc_clinic_type,
      upcc_name,
      upcc_type_of_care,
      upcc_clinic->>'clinicName' AS upcc_clinic_name,
      upcc_clinic->>'clinicType' AS upcc_clinic_type,
      fnpcc_name,
      fnpcc_clinic->>'clinicName' AS fnpcc_clinic_name,
      fnpcc_clinic->>'clinicType' AS fnpcc_clinic_type,
      nppcc_name,
      nppcc_clinic->>'clinicName' AS nppcc_clinic_name,
      nppcc_clinic->>'clinicType' AS nppcc_clinic_type,
      "formId"
  FROM
      pcn_clinic_expanded
  LEFT JOIN chc_clinic_expanded USING (community_name, pcn_name, pcn_type, health_authority, "formId")
  LEFT JOIN upcc_clinic_expanded USING (community_name, pcn_name, pcn_type, health_authority, "formId")
  LEFT JOIN fnpcc_clinic_expanded USING (community_name, pcn_name, pcn_type, health_authority, "formId")
  LEFT JOIN nppcc_clinic_expanded USING (community_name, pcn_name, pcn_type, health_authority, "formId");`)
  );
};
