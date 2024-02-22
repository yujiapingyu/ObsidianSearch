const path = require("path");
const fs = require("fs");
const { shell } = require("electron");
const cp = require("child_process");

const rootPath =
  "/Users/yujiaping/Library/Mobile Documents/iCloud~md~obsidian/Documents";
let noteCache = {};

const walkDir = (dir, callback) => {
  fs.readdirSync(dir).forEach((f) => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
};

const buildNoteCache = () => {
  noteCache = {}; // 重置缓存
  walkDir(rootPath, function (filePath) {
    if (filePath.endsWith(".md")) {
      const relativePath = filePath.substring(rootPath.length + 1);
      const pathParts = relativePath.split(path.sep);
      const vaultName = pathParts[0];
      const notePath = pathParts.slice(1).join("/");

      const fileContent = fs.readFileSync(filePath, "utf8");
      const lines = fileContent.split(/\r?\n/); // 分割文件为行数组

      lines.forEach((line, index) => {
        if (line.trim().length > 0) {
          // 忽略空行
          const noteName = path.basename(filePath, ".md");
          const noteDescObj = {
            title: noteName,
            line: line.trim(),
            lineNumber: index + 1, // 行号从1开始
            path: notePath,
            vault: vaultName,
          };
          if (!noteCache[vaultName]) noteCache[vaultName] = [];
          noteCache[vaultName].push(noteDescObj);
        }
      });
    }
  });
};

const searchNotes = (searchWord) => {
  let results = [];
  let titlesAdded = {}; // 辅助对象，用于跟踪已添加的标题

  Object.keys(noteCache).forEach(vaultName => {
    noteCache[vaultName].forEach(note => {
      // 标题匹配
      if (note.title.toLowerCase().includes(searchWord.toLowerCase())) {
        if (!titlesAdded[note.title]) { // 检查这个标题是否已被添加
          results.push({
            title: `标题: ${note.title}`,
            description: `Vault: ${note.vault}`,
            icon: 'title.png', // 为标题匹配指定一个图标
            filepath: note.path,
            vault: note.vault,
            lineNumber: 0 // 标题匹配没有具体行号
          });
          titlesAdded[note.title] = true; // 标记此标题已添加
        }
      }
      // 内容匹配
      if (note.line && note.line.toLowerCase().includes(searchWord.toLowerCase())) {
        const contentTitle = `内容: ${note.title} - Line ${note.lineNumber}`;
        if (!titlesAdded[contentTitle]) { // 检查内容匹配的标题是否已被添加
          results.push({
            title: contentTitle,
            description: note.line,
            icon: 'content.png', // 为内容匹配指定一个不同的图标
            filepath: note.path,
            vault: note.vault,
            lineNumber: note.lineNumber
          });
          titlesAdded[contentTitle] = true; // 标记此内容匹配标题已添加
        }
      }
    });
  });

  return results;
};


window.exports = {
  obsidian_search: {
    mode: "list",
    args: {
      enter: (action, callbackSetList) => {
        console.log("enter", action);
        buildNoteCache(); // 构造noteCache
        // 构造noteCache，遍历文件夹rootPath, 读取所有md文件，其中第一层文件夹是Vault
        // noteCache组成：{vaultName: [noteDescObj, noteDescObj]}
      },
      search: (action, searchWord, callbackSetList) => {
        if (!searchWord) return callbackSetList([]);
        const searchResults = searchNotes(searchWord);
        return callbackSetList(searchResults);
      },
      select: (action, itemData) => {
        window.utools.hideMainWindow();
        // 构建包含行号的Obsidian URI
        const obsidianUri = `obsidian://advanced-uri?vault=${encodeURIComponent(
          itemData.vault
        )}&filepath=${encodeURIComponent(itemData.filepath)}&line=${
          itemData.lineNumber
        }&openmode=true`;
        shell.openExternal(obsidianUri).then(() => {
          window.utools.outPlugin();
        });
      },
    },
  },
};
