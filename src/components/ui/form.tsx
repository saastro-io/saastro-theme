/**
 * Minimal shadcn-style form primitives — just enough surface for
 * @saastro/forms to wire react-hook-form fields. Standard shadcn ships
 * this file via `shadcn add form`, but at the time of writing the
 * registry doesn't expose it under that name from this project's
 * `components.json`. Hand-rolling it keeps the bundle predictable.
 *
 * Exposes:
 *   - Form: el `FormProvider` de react-hook-form, re-exportado con el nombre
 *     que usa shadcn. No es un primitivo de Base UI y no lo pretende: es el
 *     contexto que `FormField` necesita para encontrar el formulario. Faltaba,
 *     y sin él los consumidores tienen que importarlo de react-hook-form por su
 *     cuenta, que es justo la dependencia que este fichero existe para tapar.
 *   - FormField: Controller wrapper that exposes `field` props to children
 *   - FormControl: reenvía id/aria-* al input subyacente, y pone
 *     `aria-invalid` cuando el FormField que lo envuelve tiene error. Con Radix esto era
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
import {
  Controller,
  FormProvider,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useRender } from '@base-ui/react/use-render';

/**
 * EL ESTADO DEL CAMPO, PARA QUE FormControl PUEDA PONER `aria-invalid`.
 *
 * Los inputs pintan el borde rojo con `aria-invalid:border-destructive`, y el
 * único que sabe si el campo tiene error es el `Controller`. El FormControl de
 * shadcn lo saca de `useFormField()`, que exige un `FormItem` alrededor y que
 * @saastro/forms no monta; aquí `FormField` lo publica en un contexto propio
 * y `FormControl` lo lee. Fuera de un `FormField`, el contexto no está y
 * `FormControl` se queda como antes: no pone nada.
 */
const FormFieldContext = React.createContext<{ invalid: boolean } | null>(null);

/** El contexto de react-hook-form, con el nombre que espera shadcn. */
export const Form = FormProvider;

/**
 * EL SEGUNDO GENÉRICO NO ES ADORNO: SIN ÉL, `field.value` MIENTE.
 *
 * Faltaba `TName`, y sin él `ControllerProps` no puede estrechar por el `name=`
 * de cada campo: `field.value` sale como la UNIÓN de todos los campos del
 * formulario. En un diálogo que mezcla textos con un booleano, eso es
 * `string | boolean`, y el error aparece lejos de aquí — en el `value` del
 * `Input`, del `Select` y del `Switch`, ocho a la vez y todos en el fichero del
 * consumidor. Medido: con el genérico, cero.
 *
 * Es la firma que trae el shadcn oficial.
 */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ render, ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <Controller
      {...props}
      render={(args) => (
        <FormFieldContext.Provider value={{ invalid: !!args.fieldState.error }}>
          {render(args)}
        </FormFieldContext.Provider>
      )}
    />
  );
}

export interface FormControlProps extends React.ComponentProps<'div'> {
  children?: React.ReactElement;
}

export const FormControl = React.forwardRef<HTMLElement, FormControlProps>(
  function FormControl({ children, ...props }, ref) {
    const campo = React.useContext(FormFieldContext);
    return useRender({
      render: children as React.ReactElement,
      // Primero el de FormField; un aria-invalid en FormControl lo pisa, y uno
      // puesto en el propio hijo gana a los dos (useRender fusiona el hijo último).
      props: { ...(campo?.invalid ? { 'aria-invalid': true } : null), ...props },
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
