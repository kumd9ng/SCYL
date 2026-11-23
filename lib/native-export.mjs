import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const EXPORT_PATH = 'scyl-export/SCYL-set.json';
const MAX_EXPORT_LENGTH = 2_000_000;

/** Injected adapter makes completion, cancellation and write errors independently testable. */
export function createNativeSetExporter({
  isNativePlatform, share, filesystem, directory = Directory.Cache, encoding = Encoding.UTF8,
}) {
  let inFlight = false;
  return async function exportSet(jsonText) {
    if (!isNativePlatform()) return { status: 'unavailable' };
    if (inFlight) throw new Error('이미 세트를 내보내고 있습니다. 공유 화면을 닫은 뒤 다시 시도해 주세요.');
    if (typeof jsonText !== 'string' || jsonText.length > MAX_EXPORT_LENGTH) {
      throw new Error('내보낼 세트 파일이 올바르지 않거나 너무 큽니다.');
    }
    const data = JSON.parse(jsonText);
    if (!data || data.app !== 'SCYL' || data.version !== 1 || !Array.isArray(data.tracks)) {
      throw new Error('SCYL 세트 형식이 아닙니다.');
    }
    inFlight = true;
    try {
      const available = await share.canShare();
      if (!available?.value) return { status: 'unavailable' };
      // One bounded app-cache file is overwritten on the next export. Do not remove it
      // immediately after the sheet closes: the receiving app may still be reading it.
      const file = await filesystem.writeFile({
        path: EXPORT_PATH, data: jsonText, directory, encoding, recursive: true,
      });
      const uri = file?.uri || (await filesystem.getUri({ path: EXPORT_PATH, directory })).uri;
      if (typeof uri !== 'string' || !uri.startsWith('file://')) {
        throw new Error('공유할 세트 파일의 위치를 확인하지 못했습니다.');
      }
      await share.share({
        title: 'SCYL 세트', dialogTitle: 'SCYL 세트 내보내기', files: [uri],
      });
      return { status: 'shared' };
    } catch (error) {
      if (/^share cancel(?:l)?ed$/i.test(String(error?.message || '')) || error?.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      throw error;
    } finally {
      inFlight = false;
    }
  };
}

export const exportNativeSet = createNativeSetExporter({
  isNativePlatform: () => Capacitor.isNativePlatform(), share: Share, filesystem: Filesystem,
});

export function createNativeCacheClearer({ isNativePlatform, filesystem, directory = Directory.Cache }) {
  return async function clearExportCache() {
    if (!isNativePlatform()) return { status: 'unavailable' };
    try {
      // No recursive directory removal, external path or user-supplied file name.
      await filesystem.deleteFile({ path: EXPORT_PATH, directory });
    } catch (error) {
      if (!['ENOENT', 'OS-PLUG-FILE-0008'].includes(error?.code)) throw error;
    }
    return { status: 'cleared' };
  };
}

export const clearNativeExportCache = createNativeCacheClearer({
  isNativePlatform: () => Capacitor.isNativePlatform(), filesystem: Filesystem,
});
