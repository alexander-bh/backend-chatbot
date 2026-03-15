function getPositionStyles(position, isOpen) {
  if (position === "bottom-left") {
    return `"bottom:20px","left:20px"`;
  } else if (position === "middle-right") {
    return `"top:calc(50% - 40px)","right:20px"`;
  } else {
    return `"bottom:20px","right:20px"`;
  }
}

module.exports = { getPositionStyles };