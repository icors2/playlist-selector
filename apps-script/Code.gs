/**
 * Okaylist — Google Apps Script backend
 *
 * Setup:
 * 1. Create a Google Sheet (or open a blank one)
 * 2. Extensions → Apps Script → paste this file
 * 3. Project Settings → Script properties → add:
 *      APPS_SCRIPT_SECRET = <same value as GOOGLE_APPS_SCRIPT_SECRET on Netlify>
 * 4. Deploy → New deployment → Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the Web app URL into GOOGLE_APPS_SCRIPT_URL on Netlify
 *
 * Tabs (Rooms, Participants, Songs, Votes) are created automatically.
 */

var TAB = {
  rooms: "Rooms",
  participants: "Participants",
  songs: "Songs",
  votes: "Votes",
};

var HEADERS = {
  rooms: [
    "id",
    "code",
    "name",
    "host_token",
    "phase",
    "spotify_playlist_id",
    "spotify_playlist_url",
    "created_at",
  ],
  participants: ["id", "room_id", "name", "token", "created_at"],
  songs: [
    "id",
    "room_id",
    "spotify_track_id",
    "name",
    "artists",
    "album_art",
    "preview_url",
    "duration_ms",
    "nominated_by",
    "created_at",
  ],
  votes: ["id", "song_id", "participant_id", "value", "created_at"],
};

function doGet() {
  return json_({ ok: true, service: "okaylist-apps-script" });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var expected = PropertiesService.getScriptProperties().getProperty(
      "APPS_SCRIPT_SECRET",
    );
    if (!expected || body.secret !== expected) {
      return json_({ error: "unauthorized" });
    }

    ensureTabs_();

    switch (body.action) {
      case "listRooms":
        return json_({ rooms: readObjects_(TAB.rooms, HEADERS.rooms) });
      case "insertRoom":
        appendObject_(TAB.rooms, HEADERS.rooms, body.room);
        return json_({ room: body.room });
      case "updateRoom":
        updateObject_(TAB.rooms, HEADERS.rooms, body.room.id, body.room);
        return json_({ room: body.room });

      case "listParticipants":
        return json_({
          participants: filterBy_(
            readObjects_(TAB.participants, HEADERS.participants),
            "roomId",
            body.roomId,
          ),
        });
      case "insertParticipant":
        appendObject_(TAB.participants, HEADERS.participants, body.participant);
        return json_({ participant: body.participant });

      case "listSongs":
        return json_({
          songs: filterBy_(
            readObjects_(TAB.songs, HEADERS.songs),
            "roomId",
            body.roomId,
          ),
        });
      case "insertSong":
        appendObject_(TAB.songs, HEADERS.songs, body.song);
        return json_({ song: body.song });
      case "deleteSong":
        deleteById_(TAB.songs, body.songId);
        deleteWhere_(TAB.votes, HEADERS.votes, "songId", body.songId);
        return json_({ ok: true });

      case "listVotes":
        return json_({
          votes: filterByIds_(
            readObjects_(TAB.votes, HEADERS.votes),
            "songId",
            body.songIds,
          ),
        });
      case "upsertVote":
        return json_({ vote: upsertVote_(body.vote) });

      default:
        return json_({ error: "unknown action: " + body.action });
    }
  } catch (err) {
    return json_({ error: String(err && err.message ? err.message : err) });
  }
}

function json_(payload) {
  // Apps Script web apps always return HTTP 200; callers read `error` in JSON.
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureTabs_() {
  var spreadsheet = ss_();
  Object.keys(TAB).forEach(function (key) {
    var title = TAB[key];
    var sheet = spreadsheet.getSheetByName(title);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(title);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[key]);
    } else {
      var first = sheet.getRange(1, 1, 1, HEADERS[key].length).getValues()[0];
      if (!first[0]) {
        sheet.getRange(1, 1, 1, HEADERS[key].length).setValues([HEADERS[key]]);
      }
    }
  });
}

function sheet_(title) {
  var sheet = ss_().getSheetByName(title);
  if (!sheet) throw new Error("Missing sheet: " + title);
  return sheet;
}

function snakeToCamel_(key) {
  return key.replace(/_([a-z])/g, function (_, c) {
    return c.toUpperCase();
  });
}

function camelToSnake_(key) {
  return key.replace(/[A-Z]/g, function (c) {
    return "_" + c.toLowerCase();
  });
}

function readObjects_(title, headers) {
  var sheet = sheet_(title);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[0]) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var camel = snakeToCamel_(headers[c]);
      var value = row[c];
      if (value === "" || value === undefined || value === null) {
        obj[camel] = null;
      } else if (headers[c] === "duration_ms") {
        obj[camel] = Number(value);
      } else {
        obj[camel] = String(value);
      }
    }
    out.push(obj);
  }
  return out;
}

function objectToRow_(headers, obj) {
  return headers.map(function (header) {
    var camel = snakeToCamel_(header);
    var value = obj[camel];
    if (value === null || value === undefined) return "";
    return value;
  });
}

function appendObject_(title, headers, obj) {
  sheet_(title).appendRow(objectToRow_(headers, obj));
}

function findRowIndexById_(title, id) {
  var sheet = sheet_(title);
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function updateObject_(title, headers, id, obj) {
  var rowIndex = findRowIndexById_(title, id);
  if (rowIndex < 0) throw new Error("Row not found: " + id);
  sheet_(title)
    .getRange(rowIndex, 1, 1, headers.length)
    .setValues([objectToRow_(headers, obj)]);
}

function deleteById_(title, id) {
  var rowIndex = findRowIndexById_(title, id);
  if (rowIndex >= 0) sheet_(title).deleteRow(rowIndex);
}

function deleteWhere_(title, headers, camelField, value) {
  var sheet = sheet_(title);
  var snake = camelToSnake_(camelField);
  var col = headers.indexOf(snake) + 1;
  if (col < 1) return;
  var last = sheet.getLastRow();
  if (last < 2) return;
  var cells = sheet.getRange(2, col, last, 1).getValues();
  for (var i = cells.length - 1; i >= 0; i--) {
    if (String(cells[i][0]) === String(value)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function filterBy_(items, field, value) {
  if (!value) return items;
  return items.filter(function (item) {
    return item[field] === value;
  });
}

function filterByIds_(items, field, ids) {
  if (!ids || !ids.length) return items;
  var set = {};
  ids.forEach(function (id) {
    set[id] = true;
  });
  return items.filter(function (item) {
    return set[item[field]];
  });
}

function upsertVote_(vote) {
  var existing = readObjects_(TAB.votes, HEADERS.votes);
  for (var i = 0; i < existing.length; i++) {
    if (
      existing[i].songId === vote.songId &&
      existing[i].participantId === vote.participantId
    ) {
      var updated = {
        id: existing[i].id,
        songId: existing[i].songId,
        participantId: existing[i].participantId,
        value: vote.value,
        createdAt: existing[i].createdAt,
      };
      updateObject_(TAB.votes, HEADERS.votes, updated.id, updated);
      return updated;
    }
  }
  appendObject_(TAB.votes, HEADERS.votes, vote);
  return vote;
}
