const path = require("path");
const fs = require("fs");
const { pinyin } = require("pinyin-pro");

const ROOT_PATH_KEY = "configRootPath";
let configRootPath = utools.dbStorage.getItem(ROOT_PATH_KEY);
let noteCache = {};

const sentanceToPinyin = (sentance) => {
  return pinyin(sentance, { toneType: 'none', type: 'array' }).join('');
};

const walkDir = (dir, callback) => {
  fs.readdirSync(dir).forEach((f) => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
};

const buildNoteCache = () => {
  noteCache = {}; // 重置缓存
  walkDir(configRootPath, function (filePath) {
    if (filePath.endsWith(".md")) {
      const fileMTime = fs.statSync(filePath).mtimeMs;
      const relativePath = filePath.substring(configRootPath.length + 1);
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
            mtime: fileMTime
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
      if (note.title.toLowerCase().includes(searchWord.toLowerCase()) || sentanceToPinyin(note.title).includes(searchWord.toLowerCase())) {
        if (!titlesAdded[note.title]) { // 检查这个标题是否已被添加
          results.push({
            title: `标题: ${note.title}`,
            description: `Vault: ${note.vault}`,
            icon: 'resource/title.png', // 为标题匹配指定一个图标
            filepath: note.path,
            vault: note.vault,
            lineNumber: 0 // 标题匹配没有具体行号
          });
          titlesAdded[note.title] = true; // 标记此标题已添加
        }
      }
      // 内容匹配
      if (note.line && (note.line.toLowerCase().includes(searchWord.toLowerCase()) || sentanceToPinyin(note.line).includes(searchWord.toLowerCase()))) {
        const contentTitle = `内容: ${note.title} - Line ${note.lineNumber}`;
        if (!titlesAdded[contentTitle]) { // 检查内容匹配的标题是否已被添加
          results.push({
            title: contentTitle,
            description: note.line,
            icon: 'resource/content.png', // 为内容匹配指定一个不同的图标
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

const recentNotes = (num) => {
  // 返回最近修改的笔记
  let recentNotes = [];
  Object.keys(noteCache).forEach(vaultName => {
    let titlesAdded = {};
    noteCache[vaultName].forEach(note => {
      if (!titlesAdded[note.title]) {
        titlesAdded[note.title] = true;
        recentNotes.push(note);
      }
    });
  });
  recentNotes.sort((a, b) => b.mtime - a.mtime); // 根据修改时间排序
  recentNotes = recentNotes.slice(0, num); // 只返回最近num个
  recentNotes = recentNotes.map(note => {
    return {
      title: note.title,
      description: note.line,
      icon: 'resource/recent.png', // 为最近修改的笔记指定一个图标
      filepath: note.path,
      vault: note.vault,
      lineNumber: note.lineNumber
    };
  });
  return recentNotes;
};

window.exports = {
  obsidian_search: {
    mode: "list",
    args: {
      enter: (action, callbackSetList) => {
        console.log("enter", action);
        configRootPath = window.utools.dbStorage.getItem(ROOT_PATH_KEY);
        console.log("configRootPath", configRootPath);
        if (!configRootPath) {
          return callbackSetList([{
            title: "Obsidian root path尚未设置",
            description: '请先使用关键词ofsetting进行设置',
          }]);
        } 
        buildNoteCache(); // 构造noteCache
        return callbackSetList(recentNotes(10));
      },
      search: (action, searchWord, callbackSetList) => {
        configRootPath = window.utools.dbStorage.getItem(ROOT_PATH_KEY);
        if (!configRootPath) {
          if (!configRootPath) {
            return callbackSetList([{
              title: "Obsidian root path尚未设置，无法进行搜索",
              description: '请先使用关键词ofsetting进行设置',
            }]);
          } 
        }
        if (!searchWord) return callbackSetList([]);
        const searchResults = searchNotes(searchWord);
        return callbackSetList(searchResults);
      },
      select: (action, itemData) => {
        configRootPath = window.utools.dbStorage.getItem(ROOT_PATH_KEY);
        if (!configRootPath) {
          return;
        }
        window.utools.hideMainWindow();
        // 构建包含行号的Obsidian URI
        const obsidianUri = `obsidian://advanced-uri?vault=${encodeURIComponent(
          itemData.vault
        )}&filepath=${encodeURIComponent(itemData.filepath)}&line=${
          itemData.lineNumber
        }&openmode=true`;
        window.utools.shellOpenExternal(obsidianUri);
        window.utools.outPlugin();
      },
      placeholder: "输入关键词检索文档，支持拼音"
    },
  },

  obsidian_setting: {
    mode: "list",
    args: {
      enter: (action, callbackSetList) => {
        console.log("enter", action);
        configRootPath = window.utools.dbStorage.getItem(ROOT_PATH_KEY);
        console.log("configRootPath", configRootPath);
        if (!configRootPath) {
          return callbackSetList([{
            title: "Obsidian root path尚未设置",
            description: '请输入root path，如：/Users/username/Dropbox/obsidian',
          }]);
        } else {
          return callbackSetList([{
            title: "Obsidian root path已设置为：" + configRootPath,
            description: "输入新的路径可以重新进行设置",
          }]);
        }
      },
      search: (action, searchWord, callbackSetList) => {
        return callbackSetList([{
          title: "Obsidian root path将设置如下：",
          description: searchWord,
        }]);
      },
      select: (action, itemData) => {
        var path = itemData.description;
        // 检查是否为合法路径
        if (!fs.existsSync(path)) {
          window.utools.showNotification("路径不存在，请重新输入");
          return;
        }
        if (path) {
          window.utools.dbStorage.setItem(ROOT_PATH_KEY, path);
          window.utools.showNotification("Obsidian root path已设置为：" + path);
        }
        window.utools.outPlugin();
      },
      placeholder: "输入root path，按回车确认"
    },
  },
};
