import { Test, TestingModule } from '@nestjs/testing';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';
import { UserRole, AuthTokenPayload, VisitOutcome, NoteReviewDecision } from '@heals/types';

describe('EncountersController', () => {
  let controller: EncountersController;
  let service: any;

  const mockNp: AuthTokenPayload = {
    userId: 'np-1',
    email: 'np@heals.com',
    roles: [UserRole.NURSE_PRACTITIONER],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-np',
    iat: 1,
    exp: 999999,
  };

  const mockQa: AuthTokenPayload = {
    userId: 'qa-1',
    email: 'qa@heals.com',
    roles: [UserRole.CLINICAL_COORDINATOR],
    scopes: { sites: [], states: [], legalEntities: [] },
    sessionId: 'sess-qa',
    iat: 1,
    exp: 999999,
  };

  beforeEach(async () => {
    service = {
      createEncounter: jest.fn().mockResolvedValue({ id: 'enc-1' }),
      findAllEncounters: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findEncounterById: jest.fn().mockResolvedValue({ id: 'enc-1' }),
      createNote: jest.fn().mockResolvedValue({ id: 'note-1' }),
      findNoteById: jest.fn().mockResolvedValue({ id: 'note-1' }),
      updateDraftNote: jest.fn().mockResolvedValue({ id: 'note-1' }),
      signAndSubmitNote: jest.fn().mockResolvedValue({ note: { id: 'note-1' } }),
      reviewNote: jest.fn().mockResolvedValue({ review: { id: 'rev-1' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncountersController],
      providers: [
        { provide: EncountersService, useValue: service },
      ],
    }).compile();

    controller = module.get<EncountersController>(EncountersController);
  });

  describe('createEncounter', () => {
    it('should create encounter', async () => {
      const dto = {
        referralId: 'ref-1',
        outcome: VisitOutcome.COMPLETED,
        servicesProvided: ['Exam'],
      };

      const res = await controller.createEncounter(dto, mockNp);
      expect(service.createEncounter).toHaveBeenCalledWith(dto, mockNp);
      expect(res.id).toBe('enc-1');
    });
  });

  describe('createNote', () => {
    it('should create draft note', async () => {
      const dto = {
        referralId: 'ref-1',
        encounterId: 'enc-1',
        noteType: 'PROGRESS_NOTE',
        content: 'Draft content',
      };

      const res = await controller.createNote(dto, mockNp);
      expect(service.createNote).toHaveBeenCalledWith(dto, mockNp);
      expect(res.id).toBe('note-1');
    });
  });

  describe('updateDraftNote', () => {
    it('should update draft note', async () => {
      const dto = { content: 'Updated' };
      const res = await controller.updateDraftNote('note-1', dto, mockNp);
      expect(service.updateDraftNote).toHaveBeenCalledWith('note-1', dto, mockNp);
      expect(res.id).toBe('note-1');
    });
  });

  describe('signAndSubmitNote', () => {
    it('should digitally sign note', async () => {
      const res = await controller.signAndSubmitNote('note-1', mockNp);
      expect(service.signAndSubmitNote).toHaveBeenCalledWith('note-1', mockNp);
      expect(res.note.id).toBe('note-1');
    });
  });

  describe('reviewNote', () => {
    it('should record Notes QA review', async () => {
      const dto = { decision: NoteReviewDecision.APPROVE, reason: 'Approved' };
      const res = await controller.reviewNote('note-1', dto, mockQa);
      expect(service.reviewNote).toHaveBeenCalledWith('note-1', dto, mockQa);
      expect(res.review.id).toBe('rev-1');
    });
  });
});
