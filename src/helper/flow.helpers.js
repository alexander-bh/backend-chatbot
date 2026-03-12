exports.extractMediaToDelete = (payload = {}) => {

  const nodes = payload.nodes || [];
  const branches = payload.branches || [];

  const publicIds = [];
  const nodeIds = [];

  /* ================= ROOT ================= */

  if (Array.isArray(payload.media_delete_items)) {
    for (const id of payload.media_delete_items) {
      if (typeof id === "string" && id.includes("/")) {
        publicIds.push(id);
      }
    }
  }

  if (Array.isArray(payload.media_delete_nodes)) {
    for (const id of payload.media_delete_nodes) {
      if (typeof id === "string" && id.includes("/")) {
        publicIds.push(id); // ES PUBLIC_ID, NO NODE_ID
      }
    }
  }

  /* ================= NODES ================= */

  const collect = () => {};

  nodes.forEach((n, i) => collect(n, i, "main"));

  branches.forEach((branch, bi) => {
    (branch.nodes || []).forEach((n, ni) => {
      collect(n, `${bi}-${ni}`, "branch");
    });
  });

  return {
    publicIds: [...new Set(publicIds)],
    nodeIds: [...new Set(nodeIds)]
  };
};

exports.groupNodesByBranch = (allNodes = []) => {
  const grouped = {};

  for (const node of allNodes) {
    const key = node.branch_id || "__main__";

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(node);
  }

  return grouped;
};

exports.buildUploadedFilesMap = (files = []) => {
  const map = {};

  for (const file of files) {
    map[file.fieldname] = {
      url: file.path,
      public_id: file.filename,
      type: file.mimetype?.startsWith("video/") ? "video" : "image"
    };
  }

  return map;
};