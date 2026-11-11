import { describe, expect, it, vi } from 'vitest';
import { PersonalizedRecommendationService } from '../src/modules/recommendation/application/personalized-recommendation.service.js';

describe('PersonalizedRecommendationService', () => {
  it('ranks active catalog products from assessment and clear analysis concerns', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ answers: { concerns: ['ACNE'] } }] })
      .mockResolvedValueOnce({
        rows: [
          {
            provider_payload: {
              metrics: { redness: { score: 70, visibility: 'CLEAR' } },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'product-1',
            name: 'Product',
            brand: null,
            description: null,
            imageUrl: null,
            matchedConcerns: ['ACNE'],
          },
        ],
      });
    const service = new PersonalizedRecommendationService({ query } as never);

    const result = await service.getForUser(
      '25bdca3a-e978-4bdb-96f3-51fb5b0413bc',
      12,
    );

    expect(query.mock.calls[2][1]).toEqual([['ACNE', 'REDNESS'], 12]);
    expect(result.items[0].reasons).toEqual(['Matches your acne concern.']);
    expect(result.source).toMatchObject({
      assessmentAvailable: true,
      analysisAvailable: true,
    });
  });
});
