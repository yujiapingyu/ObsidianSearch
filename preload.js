const path = require("path");
const fs = require("fs");
const { shell } = require("electron");
const { pinyin } = require("pinyin-pro");

let rootPathSetting = window.utools.db.get("obsidianRootPath");
let rootPath = rootPathSetting ? rootPathSetting.data : "";
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
  walkDir(rootPath, function (filePath) {
    if (filePath.endsWith(".md")) {
      const fileMTime = fs.statSync(filePath).mtimeMs;
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
        rootPathSetting = window.utools.db.get("obsidianRootPath");
        console.log("rootPathSetting", rootPathSetting);
        if (rootPathSetting) {
          rootPath = rootPathSetting.data;
          buildNoteCache(); // 构造noteCache
          return callbackSetList(recentNotes(10));
        } else {
          console.log("Obsidian root path not set...");
        }
        
      },
      search: (action, searchWord, callbackSetList) => {
        rootPathSetting = window.utools.db.get("obsidianRootPath");
        if (!rootPathSetting) {
          return callbackSetList([{
            title: "Obsidian root path尚未设置，将设置如下：",
            description: searchWord,
          }]);
        } else {
          rootPath = rootPathSetting.data;
          buildNoteCache();
        }
        if (!searchWord) return callbackSetList([]);
        const searchResults = searchNotes(searchWord);
        return callbackSetList(searchResults);
      },
      select: (action, itemData) => {
        rootPathSetting = window.utools.db.get("obsidianRootPath");
        if (!rootPathSetting) {
          var path = itemData.description;
          const data = {
              _id: 'obsidianRootPath', // 使用唯一标识符作为_id
              data: path, // 实际保存的数据
              _rev: undefined // 初始时不知道_rev
          };

          const result = window.utools.db.put(data);
          console.log(result); // 输出结果，通常包含ok: true和新的_rev

          window.utools.outPlugin();
          
          return;
        } else {
          rootPath = rootPathSetting.data;
          buildNoteCache();
        }
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

  obsidian_setting: {
    mode: "list",
    args: {
      enter: (action, callbackSetList) => {
        console.log("enter", action);
        rootPathSetting = window.utools.db.get("obsidianRootPath");
        console.log("rootPathSetting", rootPathSetting);
        if (!rootPathSetting) {
          console.log("Obsidian root path尚未设置");
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
        const data = {
            _id: 'obsidianRootPath', // 使用唯一标识符作为_id
            data: path, // 实际保存的数据
            _rev: undefined // 初始时不知道_rev
        };

        const existing = window.utools.db.get(data._id);
        if (existing) {
            data._rev = existing._rev; // 如果已存在，使用现有的_rev
        }

        const result = window.utools.db.put(data);
        console.log(result); // 输出结果，通常包含ok: true和新的_rev
        if (result.ok) {
          window.utools.showNotification("Obsidian root path设置成功");
        } else {
          window.utools.showNotification("Obsidian root path设置失败");
        }

        window.utools.outPlugin();
      },
    },
  },
};
