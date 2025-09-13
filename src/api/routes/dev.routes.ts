import { Router, type Request, type Response, type NextFunction } from 'express';

import { BookingService } from '@services/booking/booking.service.js';

const router = Router();
const service = new BookingService();

router.post('/dev/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await service.createBooking(req.body);
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.patch('/dev/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await service.modifyBooking({ id: req.params.id, ...req.body });
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.delete('/dev/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await service.cancelBooking(req.params.id, req.body?.tenantId);
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

router.get('/dev/bookings/user/:phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.query.tenantId ?? '');
    const bookings = await service.getBookingsByUser(tenantId, req.params.phone);
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

router.get('/dev/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.query.tenantId ?? '');
    const booking = await service.getBookingById(tenantId, req.params.id);
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

export default router;
