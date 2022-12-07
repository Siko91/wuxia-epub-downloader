const cheerio = require("cheerio");
const fetch = require("node-fetch");
const puppeteer = require("puppeteer");
const fs = require("fs");
const epub = require("epub-gen");
const bookList = require("./bookList.json");
const headers = require("./headers.json");

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

Promise.all(bookList.map((url) => downloadBook(url)))
  .then((i) => console.log("DONE"))
  .catch((err) => console.error(err.stack));

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
  const output = `./books/${info.title}.epub`;
  if (fs.existsSync(output)) {
    console.log("Skipping book as it already exists : " + output);
    return;
  }

  await new epub({
    title: info.title,
    output,
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
