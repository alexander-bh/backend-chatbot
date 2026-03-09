exports.extractMediaToDelete = (nodes, branches) => {
  const media = [];

  const collect = (n) => {
    if (Array.isArray(n.media_delete_nodes)) {
      media.push(...n.media_delete_nodes);
    }

    if (Array.isArray(n.media_delete_items)) {
      media.push(...n.media_delete_items);
    }
  };

  nodes.forEach(collect);

  branches.forEach(branch => {
    (branch.nodes || []).forEach(collect);
  });

  console.log("🗑️ MEDIA TO DELETE:", media);
};


exports.groupNodesByBranch = (allNodes) => {
  const grouped = {};

  allNodes.forEach(node => {
    const key = node.branch_id || "__main__";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(node);
  });

  return grouped;
};


exports.buildUploadedFilesMap = (files = []) => {
  const map = {};

  for (const file of files) {
    map[file.fieldname] = {
      url: file.path,
      public_id: file.filename,
      type: file.mimetype.startsWith("video/") ? "video" : "image"
    };
  }

  return map;
};