export class User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  password: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  get roles(): string[] {
    return [this.role];
  }
}
