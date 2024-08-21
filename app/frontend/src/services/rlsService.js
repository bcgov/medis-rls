import { appAxios } from '~/services/interceptors';
import { ApiRoutes } from '~/utils/constants';

export default {
  /**
   * @function getRlsUsers
   * Get all RLS for particular form
   * @param {UUID} formId The form id to get RLS
   * @returns {Promise} An axios response
   */
  getRlsUsers(formId) {
    return appAxios().get(`${ApiRoutes.RLS}/${formId}`);
  },
  /**
   * @function setRlsForms
   * Set RLS for user/form/field
   * @param {Object} requestBody The request body
   * @param {Object} [params={}] The query parameters
   * @returns {Promise} An axios response
   */
  setRlsForms(requestBody, params = {}) {
    if (requestBody?.updating) {
      return appAxios().put(`${ApiRoutes.RLS}/${params.formId}`, requestBody);
    }
    return appAxios().post(`${ApiRoutes.RLS}/${params.formId}`, requestBody);
  },
  /**
   * @function deleteRlsUsers
   * Delete RLS for particular user in particular form
   * @param {Object} requestBody The request body
   * @param {Object} [params={}] The query parameters
   * @returns {Promise} An axios response
   */
  deleteRlsUsers(formId, ids) {
    return appAxios().delete(
      `${ApiRoutes.RLS}/${formId}/?ids=${ids.join(',')}`
    );
  },
};
