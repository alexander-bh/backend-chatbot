exports.extractMediaToDelete = (nodes = [], branches = []) => {
  console.log("🔍 ANALIZANDO MEDIA A ELIMINAR");

  const media = [];

  const collect = (n, index, type) => {
    console.log(`📦 Revisando nodo (${type}) index=${index}`);

    if (Array.isArray(n.media_delete_nodes)) {
      console.log("media_delete_nodes:", n.media_delete_nodes);
      media.push(...n.media_delete_nodes);
    }

    if (Array.isArray(n.media_delete_items)) {
      console.log("media_delete_items:", n.media_delete_items);
      media.push(...n.media_delete_items);
    }
  };

  nodes.forEach((n, i) => collect(n, i, "main"));

  branches.forEach((branch, bi) => {
    (branch.nodes || []).forEach((n, ni) => {
      collect(n, `${bi}-${ni}`, "branch");
    });
  });

  console.log("🗑️ MEDIA TO DELETE FINAL:", media);

  return [...new Set(media)]; // evita duplicados
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