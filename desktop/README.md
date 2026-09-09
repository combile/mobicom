# Mobi:ON 데스크톱

랩 서버의 Mobi:ON을 감싼 Electron 앱. 채팅을 보고 있지 않아도 새 메시지와
멘션이 OS 알림으로 온다.

## 개발

```bash
npm --prefix desktop install
npm --prefix desktop start
```

## 배포본 만들기

```bash
npm --prefix desktop run dist:mac   # release/*.dmg
npm --prefix desktop run dist:win   # release/*.exe
```

코드 서명을 하지 않으므로 첫 실행 때 경고가 뜬다.

- macOS: 우클릭 → 열기
- Windows: "추가 정보" → "실행"

## 설정

- macOS: `~/Library/Application Support/Mobi-ON/settings.json`
- Windows: `%APPDATA%\Mobi-ON\settings.json`

```json
{
  "serverUrl": "http://203.230.103.35:3300",
  "notify": { "enabled": true, "otherMessages": true, "taskAssigned": true }
}
```

서버 주소가 바뀌면 이 파일만 고치면 된다. 다시 빌드할 필요는 없다.

## 아이콘

`build/icon.icns`, `build/icon.ico`는 자리표시용 아이콘이다(파란 사각형에
글자 "M"). 랩 로고가 정해지면 교체해야 한다.

## 손으로 확인할 것

- 창을 닫아도 트레이에 남고 알림이 계속 오는가
- 보고 있는 채널의 메시지는 알리지 않는가
- 내가 보낸 메시지는 알리지 않는가
- 멘션 알림은 "그 외 메시지"를 꺼도 오는가
- 알림을 클릭하면 그 채널이 열리는가
- 앱을 껐다 켜도 로그인이 유지되는가
- 서버가 꺼져 있을 때 안내 화면이 뜨는가
- 배지 숫자가 안 읽음과 맞는가
