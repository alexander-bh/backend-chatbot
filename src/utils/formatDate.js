// utils/formatDate.js
const dayjs = require("dayjs");
require("dayjs/locale/es");

const formatDateAMPM = (date) => {
  return dayjs(date)
    .locale("es")
    .format("DD/MM/YYYY, hh:mm A")
    .replace("AM", "a.m")
    .replace("PM", "p.m");
};

module.exports = formatDateAMPM;
