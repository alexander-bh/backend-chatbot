module.exports = (link) => {
  if (!link) return null;

  if (link.type === "whatsapp" && !link.value.startsWith("https://")) {
    link.value = `https://wa.me/${link.value}`;
  }

  if (link.type === "phone" && !link.value.startsWith("tel:")) {
    link.value = `tel:${link.value}`;
  }

  if (link.type === "email" && !link.value.startsWith("mailto:")) {
    link.value = `mailto:${link.value}`;
  }

  return link;
};
