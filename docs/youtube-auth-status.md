# YouTube authentication status

## Incident: false green status with HTTP 401

On 2026-08-23, a rendered video failed permanently during `youtube_upload`
with HTTP 401 `Request had invalid authentication credential`, while the AMF
status bar and Settings page still showed YouTube as connected.

### Root cause

`checkYouTubeAuth()` trusted the locally stored `expiry_date`. When that date
was still in the future, it returned `connected: true` without sending the
access token to Google. A revoked, replaced or otherwise rejected access token
could therefore remain green until its local expiry time.

### Correct behaviour

The status check now calls the authenticated YouTube `channels.list` endpoint
(`part=id&mine=true`) with the stored bearer token.

- HTTP 200: connected.
- HTTP 401: refresh once, save the replacement token and probe YouTube again.
- Refresh failure or a second rejected probe: disconnected with
  `Token ungültig`.
- Other YouTube API failures: disconnected with the returned HTTP status.

This validates the same authentication boundary used by uploads instead of
equating a token file or future timestamp with a working connection.

### Production reconnect

Until AMF has a public HTTPS callback, Google OAuth on production uses the
localhost flow documented in `INFRA.md`:

1. Temporarily set `YOUTUBE_REDIRECT_BASE=http://localhost:3000` on CT 100 and
   recreate the web service.
2. Open an SSH tunnel from localhost port 3000 to CT 100.
3. Complete Google login/consent manually at
   `http://localhost:3000/api/auth/youtube`.
4. Verify a real authenticated YouTube API request returns HTTP 200.
5. Remove the temporary redirect, recreate the web service and close the
   tunnel.

Never retry a failed upload merely because the old status indicator is green.
First verify or reconnect authentication; the rendered video does not need to
be regenerated.
