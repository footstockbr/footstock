import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as LocalAuthentication from 'expo-local-authentication'
import { WebView } from 'react-native-webview'
import Constants from 'expo-constants'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

function getWebUrl() {
  const extra = Constants.expoConfig?.extra as { webUrl?: string } | undefined
  return extra?.webUrl ?? 'https://www.footstock.com.br'
}

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const webUrl = useMemo(() => getWebUrl(), [])

  const authenticate = useCallback(async () => {
    setError(null)
    setIsChecking(true)
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled = await LocalAuthentication.isEnrolledAsync()

      if (!hasHardware || !isEnrolled) {
        setIsUnlocked(true)
        return
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Foot Stock',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar senha do aparelho',
        disableDeviceFallback: false,
      })

      if (result.success) {
        setIsUnlocked(true)
      } else {
        setIsUnlocked(false)
        setError('Falha na autenticacao biometrica.')
      }
    } catch {
      setIsUnlocked(false)
      setError('Nao foi possivel validar a biometria.')
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    authenticate()
  }, [authenticate])

  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'background' || nextState === 'inactive') {
        setIsUnlocked(false)
      }
      if (nextState === 'active' && !isUnlocked) {
        authenticate()
      }
    }

    const sub = AppState.addEventListener('change', handleAppStateChange)
    return () => sub.remove()
  }, [authenticate, isUnlocked])

  return (
    <SafeAreaProvider>
      {isChecking ? (
        <SafeAreaView style={styles.centered} edges={['top', 'left', 'right', 'bottom']}>
          <StatusBar style="light" />
          <ActivityIndicator size="large" color="#c9a84c" />
          <Text style={styles.helperText}>Validando acesso...</Text>
        </SafeAreaView>
      ) : !isUnlocked ? (
        <SafeAreaView style={styles.centered} edges={['top', 'left', 'right', 'bottom']}>
          <StatusBar style="light" />
          <View style={styles.lockCard}>
            <Text style={styles.title}>Foot Stock</Text>
            <Text style={styles.subtitle}>
              Desbloqueie com biometria para continuar.
            </Text>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable style={styles.unlockButton} onPress={() => void authenticate()}>
              <Text style={styles.unlockButtonText}>Desbloquear</Text>
            </Pressable>

            <Text style={styles.platformText}>
              {Platform.OS === 'ios' ? 'Face ID/Touch ID' : 'Biometria Android'}
            </Text>
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />
          <WebView
            source={{ uri: webUrl }}
            style={styles.webview}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
          />
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#080808',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080808',
    paddingHorizontal: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262626',
    backgroundColor: '#111111',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    color: '#f4f4f4',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a3a3a3',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  helperText: {
    color: '#a3a3a3',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#f87171',
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
  },
  unlockButton: {
    marginTop: 16,
    backgroundColor: '#c9a84c',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 180,
    alignItems: 'center',
  },
  unlockButtonText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '700',
  },
  platformText: {
    color: '#737373',
    marginTop: 10,
    fontSize: 12,
  },
})
