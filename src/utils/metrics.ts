export function incrementCounter(name: string, value = 1) {
  console.log(`counter ${name} += ${value}`);
}

export function observeHistogram(name: string, ms: number) {
  console.log(`histogram ${name} observe ${ms}`);
}
