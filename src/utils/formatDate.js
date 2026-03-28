// utils/formatDate.js
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
require("dayjs/locale/es");

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDateAMPM = (date) => {
  if (!date) return null;

  return dayjs(date)
    .tz("America/Mexico_City")
    .locale("es")
    .format("DD/MM/YYYY, hh:mm A")
    .replace("AM", "a.m")
    .replace("PM", "p.m");
};

module.exports = formatDateAMPM;