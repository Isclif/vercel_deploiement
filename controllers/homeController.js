const express = require("express");
var router = express.Router();

router.get("/", (req, res) => {
  res.render("home/appHome", {});
});

module.exports = router;
