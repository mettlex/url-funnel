const polka = require("polka");

const app = polka();

app.get("/send/:text", (req, res) => {
  res.end(req.params.text);
});

app.listen(7501, () => {
  // console.log("> running server");
});

module.exports = app;
