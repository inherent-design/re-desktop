import contract from '../api.json' with { type: 'json' };
import product from '../package.json' with { type: 'json' };

export const api = Object.freeze({ ...contract, product: product.version });
export const apiError = (code, message, details) => Object.assign(new Error(message), { code, details });
const version = value => typeof value === 'string' && value.length <= 100 && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(value);

export function apiOffer(overrides = {}) {
  return { shared_apis: api.shared.supported, required_capabilities: api.shared.capabilities, agent_api: api.agent, product_version: api.product, ...overrides };
}

export function negotiate(offer, host = api) {
  const versions = offer?.shared_apis;
  const required = offer?.required_capabilities;
  if (!offer || Array.isArray(offer) || Object.keys(offer).some(key => !['shared_apis', 'required_capabilities', 'agent_api', 'product_version'].includes(key)) ||
      !Array.isArray(versions) || !versions.length || versions.length > 16 || new Set(versions).size !== versions.length || versions.some(v => !Number.isSafeInteger(v) || v < 1) ||
      !Array.isArray(required) || required.length > 32 || required.some(c => typeof c !== 'string' || !/^[a-z0-9.-]{1,64}$/.test(c)) ||
      !['agent_api', 'product_version'].every(key => version(offer[key]))) {
    throw apiError('API_INVALID_OFFER', 'Invalid API negotiation offer. No session or access was created.');
  }
  const common = versions.filter(version => host.shared.supported.includes(version));
  if (!common.length) {
    const component = Math.max(...versions) < Math.min(...host.shared.supported) ? 'bridge' : Math.max(...host.shared.supported) < Math.min(...versions) ? 'host' : 'either';
    throw apiError('API_UPGRADE_REQUIRED', `No common IPC API. Prepare a compatible ${component} through the configured release policy; do not replace an active host.`, {
      component, offered_shared_apis: versions, host_shared_apis: host.shared.supported, host_version: host.product
    });
  }
  const missing = required.filter(capability => !host.shared.capabilities.includes(capability));
  if (missing.length) throw apiError('API_CAPABILITY_REQUIRED', 'Host lacks required capabilities. Upgrade through the configured release policy.', { component: 'host', missing_capabilities: missing });
  return { shared_api: Math.max(...common), capabilities: host.shared.capabilities, agent_api: offer.agent_api, agent_version: offer.product_version, host_api: host.host, host_version: host.product };
}

export function validateAgreement(agreement, offer) {
  if (!agreement || !offer.shared_apis.includes(agreement.shared_api) ||
      !Array.isArray(agreement.capabilities) || !offer.required_capabilities.every(c => agreement.capabilities.includes(c)) ||
      agreement.agent_api !== offer.agent_api || agreement.agent_version !== offer.product_version ||
      !version(agreement.host_api) || !version(agreement.host_version)) {
    throw apiError('API_INVALID_AGREEMENT', 'Host did not confirm an offered IPC API and required capabilities. No access has been assumed.');
  }
  return agreement;
}
