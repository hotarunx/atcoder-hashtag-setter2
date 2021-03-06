// ==UserScript==
// @name         AtCoder HashTag Setter2
// @namespace    https://github.com/hotarunx
// @homepage     https://github.com/hotarunx/atcoder-hashtag-setter2
// @supportURL   https://github.com/hotarunx/atcoder-hashtag-setter2/issues
// @version      1.0.0
// @description  ツイートボタンの埋め込みテキストに情報を追加します
// @author       hotarunx
// @match        https://atcoder.jp/contests/*
// @exclude      https://atcoder.jp/contests/
// @grant        none
// @license      MIT
// ==/UserScript==

"use strict";

// 設定*************************************************************************

/**
 * @type {boolean} ネタバレ防止機能
 * コンテストが終了前かつ常設でないコンテストのとき
 * ツイートボタンのテキストに問題名、ジャッジ結果、得点を含めない
 * default: true
 */
const disableSpoiler: boolean = true;

/** @type {string[]} 常設コンテストID一覧 ネタバレ防止機能で使う */
const permanentContestIDs = [
  "practice",
  "APG4b",
  "abs",
  "practice2",
  "typical90",
  "math-and-algorithm",
];

// *****************************************************************************

/** ページタイプ型のリテラル 問題ページ、順位表ページなどを意味する */
const pageTypes = [
  "tasks",
  "task",
  "clarifications",
  "submit",
  "submissions",
  "submission",
  "score",
  "standings",
  "custom_test",
  "editorial",
  undefined,
] as const;

/**
 * ページタイプ型
 * 例: tasks, submissions, standings, ...
 * 提出詳細ページはsubmission
 * 個別の問題ページはtask
 * コンテストのトップまたは想定外ならundefined
 * その他はURLの6番目の文字列
 */
type pageType = typeof pageTypes[number];

/** ページタイプ型の型ガード */
function isPageType(name: string | undefined): name is pageType {
  return pageTypes.some((value) => value == name);
}

/**
 * ページ情報型
 * コンテスト名、コンテストIDをなどを格納するオブジェクト
 */
type Info = {
  contestTitle: string;
  contestId: string;
  pageType: pageType;
  taskTitle: string | undefined;
  taskId: string | undefined;
  submissionsUser: string | undefined;
  judgeStatus: string;
  score: string;
};

/**
 * ページからページ情報をパースして返す
 * @returns ページ情報
 */
function getInfo() {
  /** コンテスト名 例: AtCoder Beginner Contest 210 */
  const contestTitle: Info["contestTitle"] =
    document.getElementsByClassName("contest-title")[0]?.textContent ?? "";

  /**
   * ページのURL \
   * 例 (5)['https:', '', 'atcoder.jp', 'contests', 'abc210']
   */
  const url = parseURL(location.href);

  /** コンテストID 例: abc210 */
  const contestId = url[4];

  /**ページタイプ 例: tasks, submissions, standings, ... */
  const pageType = ((): pageType => {
    if (url.length < 6) return undefined;
    if (!isPageType(url[5])) return undefined;
    if (url.length >= 7 && url[5] === "submissions" && url[6] !== "me")
      return "submission";
    if (url.length >= 7 && url[5] === "tasks") return "task";
    return url[5];
  })();

  /**
   * 問題ID 例: abc210_a \
   * 問題名 A - Cabbages
   */
  const { taskId, taskTitle } = ((): {
    taskId: Info["taskId"];
    taskTitle: Info["taskTitle"];
  } => {
    // urlの長さが7未満のとき 下記の問題ID、問題名が無いページ
    if (url.length < 7) return { taskId: undefined, taskTitle: undefined };
    if (pageType === "task") {
      // 問題ページのとき
      // URLに含まれる問題ID、問題名を返す

      const taskTitle = document
        .getElementsByClassName("h2")[0]
        ?.textContent?.trim()
        .replace(/\n.*/i, "");

      return { taskId: url[6], taskTitle: taskTitle };
    } else if (pageType === "submission") {
      // 提出詳細ページのとき

      // テーブル要素集合
      const tdTags = document.getElementsByTagName("td");
      const tdTagsArray: HTMLTableCellElement[] =
        Array.prototype.slice.call(tdTags);

      // 問題の表セル要素（前の要素のテキストが`問題`の要素）を探す
      const taskCell = tdTagsArray.filter((elem: HTMLTableCellElement) => {
        const prevElem = elem.previousElementSibling;
        const text = prevElem?.textContent;
        if (typeof text === "string") return ["問題", "Task"].includes(text);
        return false;
      })[0];
      if (!taskCell) return { taskId: undefined, taskTitle: undefined };
      const taskLink = taskCell.getElementsByTagName("a")[0];
      if (!taskLink) return { taskId: undefined, taskTitle: undefined };

      // URLに含まれる問題ID、問題名を返す
      const taskURLParsed = parseURL(taskLink.href);
      return {
        taskId: taskURLParsed[6],
        taskTitle: taskLink.textContent ?? undefined,
      };
    }

    // それ以外のとき 問題ID、問題名が無いページ
    return { taskId: undefined, taskTitle: undefined };
  })();

  /** 提出ユーザー 例: machikane */
  const submissionsUser = (() => {
    if (pageType !== "submission") return undefined;
    // 提出詳細ページのとき

    // テーブル要素集合
    const thTags = document.getElementsByTagName("td");
    const thTagsArray: HTMLTableCellElement[] =
      Array.prototype.slice.call(thTags);

    // ユーザーの表セル要素（前の要素のテキストが`ユーザ`の要素）を探す
    const userCell = thTagsArray.filter((elem: HTMLTableCellElement) => {
      const prevElem = elem.previousElementSibling;
      const text = prevElem?.textContent;
      if (typeof text === "string") return ["ユーザ", "User"].includes(text);
      return false;
    })[0];
    if (!userCell) return undefined;

    return userCell?.textContent?.trim();
  })();

  /** 提出結果 例: AC */
  const judgeStatus = (() => {
    if (pageType !== "submission") return undefined;
    // 提出詳細ページのとき

    // テーブル要素集合
    const thTags = document.getElementsByTagName("td");
    const thTagsArray: HTMLTableCellElement[] =
      Array.prototype.slice.call(thTags);

    // 結果の表セル要素（前の要素のテキストが`結果`の要素）を探す
    const statusCell = thTagsArray.filter((elem: HTMLTableCellElement) => {
      const prevElem = elem.previousElementSibling;
      const text = prevElem?.textContent;
      if (typeof text === "string") return ["結果", "Status"].includes(text);
      return false;
    })[0];
    if (!statusCell) return undefined;

    return statusCell?.textContent?.trim();
  })();

  /** 得点 例: 100 */
  const score = (() => {
    if (pageType !== "submission") return undefined;
    // 提出詳細ページのとき

    // テーブル要素集合
    const thTags = document.getElementsByTagName("td");
    const thTagsArray: HTMLTableCellElement[] =
      Array.prototype.slice.call(thTags);

    // 得点の表セル要素（前の要素のテキストが`得点`の要素）を探す
    const scoreCell = thTagsArray.filter((elem: HTMLTableCellElement) => {
      const prevElem = elem.previousElementSibling;
      const text = prevElem?.textContent;
      if (typeof text === "string") return ["得点", "Score"].includes(text);
      return false;
    })[0];
    if (!scoreCell) return undefined;

    return scoreCell?.textContent?.trim();
  })();

  return {
    contestTitle,
    contestId,
    pageType,
    taskTitle,
    taskId,
    submissionsUser,
    judgeStatus,
    score,
  };
}

/**
 * ツイートボタンのテキストを取得する
 */
function getTweetButtonText() {
  /** ツイートボタンのHTML要素 */
  const a2a_kit = document.getElementsByClassName("a2a_kit")[0];
  if (!a2a_kit) return;
  /** ツイートボタンのテキスト */
  const a2a_title = a2a_kit.getAttribute("data-a2a-title");
  return a2a_title;
}

/**
 * ツイートボタンのテキストを変更する
 */
function setTweetButtonText(text: string) {
  /** ツイートボタンのHTML要素 */
  const a2a_kit = document.getElementsByClassName("a2a_kit")[0];
  if (!a2a_kit) return "";
  a2a_kit.setAttribute("data-a2a-title", text);
  // TODO: デバッグ用
  console.log("tweet text :>> ", getTweetButtonText());
  return getTweetButtonText();
}

// メイン処理
window.addEventListener("load", function () {
  const info = getInfo();
  // TODO: デバッグ用
  console.log("info :>> ", info);

  /** コンテストハッシュタグ 例: #AtCoder_abc210_a */
  const contestHashtag = info.contestId ? ` #AtCoder_${info.contestId}` : "";
  /** 問題ハッシュタグ 例: #AtCoder_abc210_a */
  const taskHashtag = info.taskId ? ` #AtCoder_${info.taskId}` : "";

  // ツイートボタンのテキストを取得する
  const text = getTweetButtonText();
  if (!text) return;

  // ページに合わせてテキストを編集する
  let newText = "";

  // コンテストが終了しているまたは常設中のコンテストか判定
  // コンテスト終了前にコンテストの情報をツイートボタンに含めることを防ぐため
  if (isContestOverOrPermanent(info.contestId ?? "") || !disableSpoiler) {
    // コンテストが終了しているまたは常設中のコンテスト
    if (info.pageType === "task") {
      // 個別の問題ページ
      // 例: A - Cabbages - AtCoder Beginner Contest 210 #AtCoder_abc210_a #AtCoder_abc210
      newText = text + " - " + info.contestTitle + taskHashtag + contestHashtag;
    } else if (info.pageType === "submission") {
      // 提出詳細ページ
      // 例: machikaneさんのA - Cabbagesへの提出 #24282585
      // 結果：AC
      // 得点：100
      // AtCoder Beginner Contest 210 #AtCoder_abc210_a #AtCoder_abc210

      // @ts-ignore
      // eslint-disable-next-line no-undef
      if (LANG === "ja") {
        // 日本語
        newText =
          `${info.submissionsUser}さんの${info.taskTitle}への` +
          text.replace(
            " - " + info.contestTitle,
            `\n結果：${info.judgeStatus}\n得点：${info.score}\n${info.contestTitle}`
          ) +
          taskHashtag +
          contestHashtag;
      } else {
        // 英語
        newText =
          `${info.submissionsUser}'s ` +
          text.replace(
            " - " + info.contestTitle,
            ` to ${info.taskTitle}\nStatus: ${info.judgeStatus}\nScore: ${info.score}\n${info.contestTitle}`
          ) +
          taskHashtag +
          contestHashtag;
      }
    } else {
      // その他のページ
      // 例: 順位表 - AtCoder Beginner Contest 210 #AtCoder_abc210
      newText = text + contestHashtag;
    }
  } else {
    // コンテストが終了していないかつ常設ではない
    // コンテストハッシュタグを追加するだけにする

    // その他のページ
    // 例: 順位表 - AtCoder Beginner Contest 210 #AtCoder_abc210
    newText = text + contestHashtag;
  }

  setTweetButtonText(newText);
});

/**
 * URLをパースする \
 * パラメータを消す \
 * 例 \
 * in:  https://atcoder.jp/contests/abc210?lang=en \
 * out: (5)['https:', '', 'atcoder.jp', 'contests', 'abc210']
 */
function parseURL(url: string) {
  // 区切り文字`/`で分割する
  // ?以降の文字列を削除してパラメータを削除する
  return url.split("/").map((x) => x.replace(/\?.*/i, ""));
}

/**
 * コンテストが終了しているかコンテストが常設コンテストであることを判定
 *
 * @param {string} contestId
 */
function isContestOverOrPermanent(contestId: string) {
  // 常設中のコンテストか判定
  if (permanentContestIDs.includes(contestId)) {
    return true;
  }

  // 現在時間（UNIX時間 + 時差）
  const nowTime = Math.floor(Date.now() / 1000);
  // コンテスト終了時間
  // @ts-ignore
  // eslint-disable-next-line no-undef
  const contestEndTime = Math.floor(Date.parse(endTime._i) / 1000);

  // コンテスト終了後か判定
  return contestEndTime < nowTime;
}
