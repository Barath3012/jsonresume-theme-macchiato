const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const handlebars = require('handlebars');
const handlebarsWax = require('handlebars-wax');
const moment = require('moment');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON body
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Register Handlebars helpers
handlebars.registerHelper({
  removeProtocol: url => url.replace(/.*?:\/\//g, ''),
  concat: (...args) => args.filter(arg => typeof arg !== 'object').join(''),
  formatAddress: (...args) => args.filter(arg => typeof arg !== 'object').join(' '),
  formatDate: date => (moment(date, moment.ISO_8601).isValid() ? moment(date).format('YYYY-MM') : ''),
  lowercase: s => s.toLowerCase(),
  eq: (a, b) => a === b,
});

// Rendering logic
function render(resume) {
  const dir = path.join(__dirname, 'src');
  const css = fs.readFileSync(`${dir}/style.css`, 'utf-8');
  const resumeTemplate = fs.readFileSync(`${dir}/resume.hbs`, 'utf-8');

  const Handlebars = handlebarsWax(handlebars);
  Handlebars.partials(`${dir}/partials/**/*.{hbs,js}`);

  return Handlebars.compile(resumeTemplate)({
    style: `<style>${css}</style>`,
    resume,
  });
}

// Expose POST route for rendering HTML
app.post('/preview', (req, res) => {
  try {
    const resumeJSON = req.body;
    const html = render(resumeJSON);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating resume preview.');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.post('/generate-pdf', async (req, res) => {
  try {
    console.log('Got a POST request');
    const resumeJSON = req.body; // 👈 gets the JSON from the client
    const html = render(resumeJSON); // your render() function already supports this

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '0in',
        bottom: '0in',
        left: '0in',
        right: '0in',
      },
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=resume.pdf',
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate PDF');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Resume preview server running at http://localhost:${PORT}`);
});
