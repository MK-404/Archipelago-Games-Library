-- One row per (user, game). Vote counts are computed from `votes`, so they can't drift.
CREATE TABLE IF NOT EXISTS favorites (
    user_id    TEXT    NOT NULL,
    game       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
);

CREATE TABLE IF NOT EXISTS votes (
    user_id    TEXT    NOT NULL,
    game       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
);

CREATE INDEX IF NOT EXISTS votes_by_game ON votes (game);
