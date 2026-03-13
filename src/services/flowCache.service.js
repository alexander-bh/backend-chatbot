const flowCache = new Map();

function getFlowCache(flowId) {
  return flowCache.get(String(flowId));
}

function setFlowCache(flowId, data) {
  flowCache.set(String(flowId), data);
}

function clearFlowCache(flowId) {
  flowCache.delete(String(flowId));
}

module.exports = {
  getFlowCache,
  setFlowCache,
  clearFlowCache
};