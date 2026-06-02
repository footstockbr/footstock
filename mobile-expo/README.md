# FootStock Mobile (Expo WebView)

Aplicativo mobile para iOS e Android usando Expo + WebView, com desbloqueio biométrico antes de abrir o app web.

## Requisitos

- Node 20+
- Expo CLI (`npx expo`)
- Xcode (iOS) e/ou Android Studio (Android)

## Instalação

```bash
cd mobile-expo
npm install
```

## Configurar URL do Web App

No arquivo `app.json`, ajuste:

```json
{
  "expo": {
    "extra": {
      "webUrl": "https://footstock.app"
    }
  }
}
```

Para desenvolvimento local em dispositivo físico, use a URL acessível na rede local, por exemplo:

- `http://192.168.x.x:3000`

## Rodar

```bash
npm run start
```

Atalhos:

- `npm run ios`
- `npm run android`

## Biometria

- iOS: Face ID / Touch ID (mensagem configurada em `NSFaceIDUsageDescription`)
- Android: biometria do dispositivo

Se o aparelho não tiver biometria configurada, o app libera acesso sem bloqueio biométrico.

