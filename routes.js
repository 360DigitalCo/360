/**
 * 360 OAuth routes — mount on your Express app:
 *
 *   import oauthRouter from './auth/server/routes.js';
 *   app.use('/oauth', oauthRouter);
 */

import { Router } from 'express';
import {
  authorize,
  consentApprove,
  token,
  revoke,
  userinfo,
  registerClient,
  listClients,
  getClientMetadata,
  deleteClient,
  jwks,
} from './oauth.js';

const router = Router();

// Authorization Code flow
router.get('/authorize',         authorize);
router.post('/consent/approve',  consentApprove);

// Token lifecycle
router.post('/token',            token);
router.post('/token/revoke',     revoke);

// OpenID Connect
router.get('/userinfo',          userinfo);
router.get('/keys',              jwks);

// Developer — client management
router.get('/clients',              listClients);
router.post('/clients',             registerClient);
router.get('/clients/:clientId',    getClientMetadata);
router.delete('/clients/:clientId', deleteClient);

export default router;
