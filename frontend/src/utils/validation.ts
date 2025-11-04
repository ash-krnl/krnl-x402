export const isValidAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const isValidBytes32 = (value: string): boolean => {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
};

export const isValidSignature = (signature: string): boolean => {
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
};

export const isValidTimestamp = (timestamp: string): boolean => {
  const num = parseInt(timestamp);
  return !isNaN(num) && num > 0;
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isValidAmount = (amount: string): boolean => {
  const num = parseInt(amount);
  return !isNaN(num) && num > 0;
};
