// Keep a version-pinned search on its ORIGINAL exact term set. The SQL
// fingerprint includes both source versions and normalized search terms:
// changing terms on page two otherwise produces a misleading
// "version_changed" error and discards valid evidence. This helper never
// invents a cursor or reads beyond the owner's original scope.
// The supplied fingerprint/term map exists only for one authenticated turn.
export const canonicalOccurrenceTerms=(terms)=>{
  if(!Array.isArray(terms)||terms.some(t=>typeof t!=="string"))return null;
  return [...new Set(terms.map(t=>t.trim().toLocaleLowerCase("en")).filter(Boolean))].sort();
};
export function pinWorkOccurrenceContinuation(args,initialTermsByFingerprint){
  if(!args||!initialTermsByFingerprint||!Number.isSafeInteger(args.offset)||args.offset<=0||
    typeof args.expected_fingerprint!=="string"||
    !/^[a-f0-9]{32}$/.test(args.expected_fingerprint))return {args,restored:false};
  const original=initialTermsByFingerprint.get(args.expected_fingerprint);
  if(!Array.isArray(original)||!original.length)return {args,restored:false};
  const requested=canonicalOccurrenceTerms(args.terms),expected=canonicalOccurrenceTerms(original);
  if(!requested||!expected)return {args,restored:false};
  if(JSON.stringify(requested)===JSON.stringify(expected))return {args,restored:false};
  return {args:{...args,terms:[...original]},restored:true};
}
export function rememberWorkOccurrenceFirstPage(result,initialTermsByFingerprint){
  if(result?.status!=="ok"||result.offset!==0||
    typeof result.fingerprint!=="string"||!/^[a-f0-9]{32}$/.test(result.fingerprint)||
    !initialTermsByFingerprint||initialTermsByFingerprint.size>=16)return false;
  const terms=canonicalOccurrenceTerms(result.terms);
  if(!terms||!terms.length||terms.length>12)return false;
  initialTermsByFingerprint.set(result.fingerprint,terms);
  return true;
}
