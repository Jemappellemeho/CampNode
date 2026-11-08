import { API_ORIGIN } from '../pages/courseManager/courseManagerConstants';
import { api } from './api';

export async function moveSubtopic(
  courseId: string,
  subtopicId: string,
  newParentTopicId: string,
  newIndex: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await api.put(
      `${API_ORIGIN}/api/courses/${courseId}/topics/${subtopicId}/move`,
      { targetParentId: newParentTopicId, targetIndex: newIndex }
    );

    if (response.status < 200 || response.status >= 300) {
      return { ok: false, message: 'Move failed, nothing was changed.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: 'Move failed, nothing was changed.' };
  }
}
