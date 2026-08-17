/**
 * Minimal shadcn-style form primitives — just enough surface for
 * @saastro/forms to wire react-hook-form fields. Standard shadcn ships
 * this file via `shadcn add form`, but at the time of writing the
 * registry doesn't expose it under that name from this project's
 * `components.json`. Hand-rolling it keeps the bundle predictable.
 *
 * Exposes:
 *   - FormField: Controller wrapper that exposes `field` props to children
 *   - FormControl: reenvía id/aria-* al input subyacente. Con Radix esto era
 *     `Slot`; en Base UI el equivalente es el hook `useRender`, que fusiona las
 *     props sobre el hijo. Se mantiene hecho a mano A PROPÓSITO: el `FormControl`
 *     oficial de shadcn usa `useFormField()` y exige un `FormItem` alrededor,
 *     que @saastro/forms no monta — usarlo reventaría en runtime.
 *     NO regenerar este fichero con `shadcn add form`.
 *
 * The remaining named primitives @saastro/forms looks up (Field,
 * FieldLabel, FieldDescription, FieldError) come from the standard
 * shadcn `field.tsx`.
 */
import * as React from 'react';
import { Controller, type ControllerProps, type FieldValues } from 'react-hook-form';
import { useRender } from '@base-ui/react/use-render';

export function FormField<TFieldValues extends FieldValues = FieldValues>(
  props: ControllerProps<TFieldValues>,
) {
  return <Controller {...props} />;
}

export interface FormControlProps extends React.ComponentProps<'div'> {
  children?: React.ReactElement;
}

export const FormControl = React.forwardRef<HTMLElement, FormControlProps>(
  function FormControl({ children, ...props }, ref) {
    return useRender({
      render: children as React.ReactElement,
      props,
      ref: ref as React.Ref<HTMLElement>,
    });
  },
);

export const FormItem = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  function FormItem({ className, ...props }, ref) {
    return <div ref={ref} className={className} {...props} />;
  },
);

export const FormLabel = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  function FormLabel({ className, ...props }, ref) {
    return <label ref={ref} className={className} {...props} />;
  },
);

export const FormMessage = React.forwardRef<HTMLParagraphElement, React.ComponentProps<'p'>>(
  function FormMessage({ className, children, ...props }, ref) {
    if (!children) return null;
    return (
      <p ref={ref} className={className} {...props}>
        {children}
      </p>
    );
  },
);

export const FormDescription = FormMessage;
