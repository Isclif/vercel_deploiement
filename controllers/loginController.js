const express = require("express");
var router = express.Router();

router.get("/", (req, res) => {
  res.render("home/sign");
});
module.exports = router; 
