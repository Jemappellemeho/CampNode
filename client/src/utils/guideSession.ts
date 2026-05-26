const GUIDE_PREFIX = 'campnode:guide:';

export const getGuideKey = (user: any, page: string) => {
  const identity = user?.id || user?.email || 'anon';
  const role = user?.role || 'user';
  return `${GUIDE_PREFIX}${identity}:${role}:${page}`;
};

export const hasSeenGuide = (user: any, page: string) => {
  return sessionStorage.getItem(getGuideKey(user, page)) === 'true';
};

export const markGuideSeen = (user: any, page: string) => {
  sessionStorage.setItem(getGuideKey(user, page), 'true');
};

export const resetGuideSession = () => {
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(GUIDE_PREFIX))
    .forEach((key) => sessionStorage.removeItem(key));
};
