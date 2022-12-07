const cheerio = require("cheerio");
const fetch = require("node-fetch");
const puppeteer = require("puppeteer");
const fs = require("fs");
const epub = require("epub-gen");

const selectors = {
  info: {
    novelId: ".rate-info #rating",
    title: ".desc .title",
    meta: ".desc .info-meta",
    description: "#tab-description .desc-text",
    moreFromAuthorList: "#tab-author .list-thumb a",
    chapterList: ".list-chapter a",
  },
  chapter: {
    content: "#chr-content",
  },
};

const headers = {
  //   Host: "readnovelfull.com",
  "User-Agent":
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:107.0) Gecko/20100101 Firefox/107.0",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  DNT: "1",
  //   "Alt-Used": "readnovelfull.com",
  Connection: "keep-alive",
  //   "Upgrade-Insecure-Requests": "1",
  //   "Sec-Fetch-Dest": "document",
  //   "Sec-Fetch-Mode": "navigate",
  //   "Sec-Fetch-Site": "none",
  //   "Sec-Fetch-User": "?1",
  //   "Sec-GPC": "1",
  TE: "trailers",
};

const bookList = [
  "https://readnovelfull.com/pursuit-of-the-truth-v1.html",
  "https://readnovelfull.com/a-will-eternal.html",
  "https://readnovelfull.com/renegade-immortal.html",
  "https://readnovelfull.com/i-shall-seal-the-heavens.html",
];

downloadBook("https://readnovelfull.com/pursuit-of-the-truth-v1.html")
  .then((i) => {
    console.log("DONE");
  })
  .catch((err) => {
    console.error(err.stack);
  });

async function downloadBook(url) {
  const info = await parseInfo(url);
  await downloadChapters(info);
  await constructBook(info);
}

async function parseInfo(url) {
  const html = await fetch(url, { headers }).then((i) => i.text());
  const $ = cheerio.load(html);

  const info = {
    novelId: "",
    title: "",
    meta: "",
    description: "",
    moreFromAuthor: [{ url: "", title: "" }],
    chapters: [{ url: "", title: "", tempFile: "" }],
  };

  info.id = $(selectors.info.novelId).attr("data-novel-id");
  info.title = $($(selectors.info.title)[0]).text();
  info.meta = $(selectors.info.meta).html();
  info.description = $(selectors.info.description).text();
  info.moreFromAuthor = [];
  info.chapters = [];

  const moreArr = $(selectors.info.moreFromAuthorList);
  for (let i = 0; i < moreArr.length; i++) {
    const moreEl = moreArr[i];
    info.moreFromAuthor.push({
      url: $(moreEl).attr("href"),
      title: $(moreEl).text().replace(/\n/g, " ").trim(),
    });
  }

  const chaptersHtml = await fetch(
    "https://readnovelfull.com/ajax/chapter-archive?novelId=" + info.id,
    { headers }
  ).then((i) => i.text());
  const chapter$ = cheerio.load(chaptersHtml);

  const chapArr = chapter$(selectors.info.chapterList);
  for (let i = 0; i < chapArr.length; i++) {
    const chapEl = chapArr[i];
    const title = chapter$(chapEl).text().trim();
    info.chapters.push({
      title,
      url: chapter$(chapEl).attr("href"),
      tempFile: `temp/${info.id}/${i}-${title}.html`,
    });
  }

  if (!fs.existsSync("temp/" + info.id)) fs.mkdirSync("temp/" + info.id);

  return info;
}

async function downloadChapters(info) {
  for (let i = 0; i < info.chapters.length; i++) {
    if (fs.existsSync(info.chapters[i].tempFile)) continue;
    const url = "https://readnovelfull.com" + info.chapters[i].url;
    const html = await fetch(url, { headers }).then((i) => i.text());
    const $ = cheerio.load(html);
    const text = $(selectors.chapter.content).html().trim();
    fs.writeFileSync(info.chapters[i].tempFile, text);
    console.log(`Saved chapter ${i}/${info.chapters.length}`);
  }
}

async function constructBook(info) {
  await new epub({
    title: info.title,
    output: `books/${info.title}.epub`,
    content: [
      {
        title: "About",
        data:
          `<p>` +
          `<h1>${info.title}</h1>` +
          `<h3>ID: ${info.novelId}</h3>` +
          `<div>${info.meta}</div>` +
          `<div>${info.description}</div>` +
          `<h3>More from this author:</h3>` +
          `<ul>${info.moreFromAuthor.map((otherBook) => {
            return `<li><a href="https://readnovelfull.com${otherBook.url}">${otherBook.title}</a></li>`;
          })}</ul>` +
          `</p>`,
      },
      ...info.chapters.map((chap) => {
        return {
          title: chap.title || "{ missing chapter title }",
          data: `<p>${fs.readFileSync(chap.tempFile)}</p>`,
        };
      }),
    ],
  }).promise;
}
