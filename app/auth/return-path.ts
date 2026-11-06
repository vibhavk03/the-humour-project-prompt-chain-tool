export function returnPath(value: unknown) { return value === '/chains' ? '/chains' : '/'; }
export function loginError(value: unknown) {
  const errors: Record<string,string>={
    cancelled:'Google sign-in was cancelled. You can try again.',
    callback:'Sign-in could not be completed. Try again in the same browser where you started.',
    unavailable:'The authentication service is unavailable. Please try again.',
  };
  return typeof value==='string' ? errors[value] ?? '' : '';
}
