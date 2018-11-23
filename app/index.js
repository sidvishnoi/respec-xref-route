const express = require('express');
const bodyParser = require('body-parser');

const xrefResponse = require("./xref-response");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post("/xref", ({ body }, res) => {
  const response = xrefResponse(body);
  res.json(response);
});

const port = parseInt(process.env.PORT, 10) || 3000;
app.listen(port, () => console.log(`Listening on port ${port}!`));
