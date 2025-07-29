const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const handlebars = require('handlebars');
const handlebarsWax = require('handlebars-wax');
const moment = require('moment');
const puppeteer = require('puppeteer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON body
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

// Register Handlebars helpers
handlebars.registerHelper({
  removeProtocol: url => url.replace(/.*?:\/\//g, ''),
  concat: (...args) => args.filter(arg => typeof arg !== 'object').join(''),
  formatAddress: (...args) => args.filter(arg => typeof arg !== 'object').join(' '),
  formatDate: date => (moment(date, moment.ISO_8601).isValid() ? moment(date).format('YYYY-MM') : ''),
  lowercase: s => s.toLowerCase(),
  eq: (a, b) => a === b,
});

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

function bufferToStream(buffer) {
  const readable = new Readable();
  // eslint-disable-next-line no-underscore-dangle
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

app.post('/generate-pdf', async (req, res) => {
  try {
    console.log('📨 Got a POST request to generate PDF');
    const resumeJSON = req.body;

    const html = render(resumeJSON); // Assuming you already have this
    console.time('puppeteer');
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // Use system Chromium
      headless: true, // or true
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    console.log('waiting...');
    await page.emulateMediaType('screen'); // Try using screen CSS
    // await page.goto(`data:text/html;charset=UTF-8,${html}`, { waitUntil: 'networkidle0' });
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
    console.timeEnd('puppeteer');
    // Upload to Cloudinary
    console.log('Cloudinary Begins now.');
    console.time('cloudinary');
    const name = resumeJSON.basics.name.trim().replace(/\s+/g, '_');
    const publicId = `${name}-${Date.now()}`;

    const assertFolder = 'Resumes';
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw', // PDFs are not images
        public_id: publicId,
        overwrite: true,
        asset_folder: assertFolder,
      },
      /* eslint-disable consistent-return */
      (error, result) => {
        console.log('Cloudinary Upload Began.');
        if (error) {
          console.log('Cloudinary Error.');
          console.error('❌ Cloudinary upload failed:', error);
          console.log(result);
          return res.status(500).send('PDF generated but upload failed');
        }

        console.log('✅ Uploaded to Cloudinary:', result.secure_url);

        // Send download link or serve the PDF directly:
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=resume.pdf',
          'Content-Length': pdfBuffer.length,
        });
        console.timeEnd('cloudinary');

        res.send(pdfBuffer);
        // Or instead of res.send(pdfBuffer), you can send JSON like:
        // res.json({ cloudUrl: result.secure_url });
      },
    );

    bufferToStream(pdfBuffer).pipe(uploadStream);
  } catch (err) {
    // console.error('❌ PDF generation failed:', err);
    res.status(500).send('Failed to generate PDF');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Resume preview server running at http://localhost:${PORT}`);
});
