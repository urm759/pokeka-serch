function sourceReference(sourceId, stableId, previous = {}, image) {
  const confirmedStableReference = previous.sourceId === stableId && sourceId !== stableId;
  const stableImage = typeof previous.img === "string" && previous.img.endsWith(`/${stableId}.webp`);
  return {
    sourceId: confirmedStableReference ? stableId : sourceId,
    image: confirmedStableReference && stableImage ? previous.img : image,
  };
}

module.exports = { sourceReference };
