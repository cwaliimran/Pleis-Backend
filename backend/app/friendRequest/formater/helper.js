


const escapeRegex = (value) => {
  if (!value) return value;
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};


module.exports = {
escapeRegex,

};